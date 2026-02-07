package terminal

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"os"
	"sync"
	"sync/atomic"
	"time"

	"github.com/google/uuid"
	"github.com/gorilla/websocket"
	"github.com/xxnuo/vibego/internal/model"
	"gorm.io/gorm"
)

type terminalConnection struct {
	ID        string
	Master    master
	Ctx       context.Context
	Cancel    context.CancelFunc
	AckCursor atomic.Uint64
}

type activeTerminal struct {
	ID            string
	PTY           slave
	Session       *model.TerminalSession
	Connections   sync.Map
	Done          chan struct{}
	historyBuffer *historyBuffer
	historyMu     sync.RWMutex
	status        atomic.Value
	flushTicker   *time.Ticker
	bufferSize    int
	encoder       *base64.Encoding
}

type Manager struct {
	db                   *gorm.DB
	terminals            sync.Map
	shell                string
	bufferSize           int
	maxConnections       int
	activeConns          atomic.Int64
	historyBufferSize    int
	historyFlushInterval time.Duration
	historyMaxRecords    int
	historyMaxAge        time.Duration
	wsPingInterval       time.Duration
	wsReadTimeout        time.Duration
	wsWriteTimeout       time.Duration
}

type replaySnapshot struct {
	data   []byte
	cursor uint64
	reset  bool
}

func NewManager(db *gorm.DB, cfg *ManagerConfig) *Manager {
	if cfg == nil {
		cfg = &ManagerConfig{}
	}
	cfg.applyDefaults()

	return &Manager{
		db:                   db,
		shell:                cfg.Shell,
		bufferSize:           cfg.BufferSize,
		maxConnections:       cfg.MaxConnections,
		historyBufferSize:    cfg.HistoryBufferSize,
		historyFlushInterval: cfg.HistoryFlushInterval,
		historyMaxRecords:    cfg.HistoryMaxRecords,
		historyMaxAge:        cfg.HistoryMaxAge,
		wsPingInterval:       cfg.WSPingInterval,
		wsReadTimeout:        cfg.WSReadTimeout,
		wsWriteTimeout:       cfg.WSWriteTimeout,
	}
}

func (m *Manager) Create(opts CreateOptions) (*TerminalInfo, error) {
	cwd := opts.Cwd
	if cwd == "" {
		var err error
		cwd, err = os.Getwd()
		if err != nil {
			cwd = os.Getenv("HOME")
		}
	}
	cols := opts.Cols
	if cols <= 0 {
		cols = 80
	}
	rows := opts.Rows
	if rows <= 0 {
		rows = 24
	}

	name := opts.Name
	if name == "" {
		var count int64
		m.db.Model(&model.TerminalSession{}).Count(&count)
		name = fmt.Sprintf("Terminal %d", count+1)
	}

	pty, err := newLocalCommand(m.shell, nil, cwd, cols, rows)
	if err != nil {
		return nil, err
	}

	now := time.Now().Unix()
	session := &model.TerminalSession{
		ID:        uuid.New().String(),
		UserID:    opts.UserID,
		Name:      name,
		Shell:     m.shell,
		Cwd:       cwd,
		Cols:      cols,
		Rows:      rows,
		Status:    model.StatusRunning,
		CreatedAt: now,
		UpdatedAt: now,
	}

	if err := m.db.Create(session).Error; err != nil {
		pty.Close()
		return nil, err
	}

	active := &activeTerminal{
		ID:            session.ID,
		PTY:           pty,
		Session:       session,
		Done:          make(chan struct{}),
		historyBuffer: newHistoryBuffer(m.historyBufferSize),
		flushTicker:   time.NewTicker(m.historyFlushInterval),
		bufferSize:    m.bufferSize,
		encoder:       base64.StdEncoding,
	}
	active.status.Store(model.StatusRunning)

	m.terminals.Store(session.ID, active)

	go m.ptyReadLoop(active)
	go m.monitorPTY(active, pty)
	go m.flushHistory(active)

	return sessionToInfo(session), nil
}

func (m *Manager) markClosed(id string) {
	m.db.Model(&model.TerminalSession{}).Where("id = ?", id).Updates(map[string]any{
		"status":     model.StatusClosed,
		"updated_at": time.Now().Unix(),
	})
}

func (m *Manager) getActive(id string) (*activeTerminal, bool) {
	val, ok := m.terminals.Load(id)
	if !ok {
		return nil, false
	}
	return val.(*activeTerminal), true
}

func (m *Manager) Get(id string) (*TerminalInfo, bool) {
	at, ok := m.getActive(id)
	if !ok {
		return nil, false
	}
	return &TerminalInfo{
		ID:        at.Session.ID,
		Name:      at.Session.Name,
		Shell:     at.Session.Shell,
		Cwd:       at.Session.Cwd,
		Cols:      at.Session.Cols,
		Rows:      at.Session.Rows,
		Status:    at.status.Load().(string),
		CreatedAt: at.Session.CreatedAt,
		UpdatedAt: at.Session.UpdatedAt,
	}, true
}

func (m *Manager) Resize(id string, cols, rows int) error {
	at, ok := m.getActive(id)
	if !ok {
		return ErrTerminalNotFound
	}

	if err := at.PTY.ResizeTerminal(cols, rows); err != nil {
		return err
	}

	at.Session.Cols = cols
	at.Session.Rows = rows
	at.Session.UpdatedAt = time.Now().Unix()

	m.db.Model(&model.TerminalSession{}).Where("id = ?", id).Updates(map[string]any{
		"cols":       cols,
		"rows":       rows,
		"updated_at": at.Session.UpdatedAt,
	})

	return nil
}

func (m *Manager) Rename(id, name string) error {
	now := time.Now().Unix()
	result := m.db.Model(&model.TerminalSession{}).Where("id = ?", id).Updates(map[string]any{
		"name":       name,
		"updated_at": now,
	})
	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected == 0 {
		return ErrTerminalNotFound
	}

	if at, ok := m.getActive(id); ok {
		at.Session.Name = name
		at.Session.UpdatedAt = now
	}

	return nil
}

func (m *Manager) Close(id string) error {
	val, ok := m.terminals.LoadAndDelete(id)
	if !ok {
		return nil
	}
	at := val.(*activeTerminal)

	at.Connections.Range(func(key, value any) bool {
		conn := value.(*terminalConnection)
		conn.Cancel()
		return true
	})

	at.flushTicker.Stop()

	at.historyMu.Lock()
	m.flushHistoryToDB(at)
	at.historyMu.Unlock()

	at.PTY.Close()
	close(at.Done)

	now := time.Now().Unix()
	at.status.Store(model.StatusClosed)
	at.Session.Status = model.StatusClosed
	at.Session.UpdatedAt = now
	m.db.Model(&model.TerminalSession{}).Where("id = ?", id).Updates(map[string]any{
		"status":     model.StatusClosed,
		"updated_at": now,
	})

	return nil
}

func (m *Manager) Delete(id string) error {
	m.Close(id)
	m.db.Where("session_id = ?", id).Delete(&model.TerminalHistory{})
	m.db.Where("id = ?", id).Delete(&model.TerminalSession{})
	return nil
}

func (m *Manager) ptyReadLoop(at *activeTerminal) {
	maxRawSize := (at.bufferSize - 1) / 4 * 3
	buf := make([]byte, maxRawSize)

	for {
		select {
		case <-at.Done:
			return
		default:
		}

		n, err := at.PTY.Read(buf)
		if err != nil {
			return
		}

		if n == 0 {
			continue
		}

		at.historyMu.Lock()
		at.historyBuffer.Write(buf[:n])
		_, endCursor := at.historyBuffer.CursorRange()
		at.historyMu.Unlock()

		msg := WSMessage{
			Type:   MsgTypeOutput,
			Data:   at.encoder.EncodeToString(buf[:n]),
			Cursor: endCursor,
		}
		m.broadcast(at, msg)
	}
}

func (m *Manager) monitorPTY(at *activeTerminal, pty *localCommand) {
	<-pty.ptyClosed

	exitCode := pty.ExitCode()
	now := time.Now().Unix()

	at.status.Store(model.StatusExited)
	at.Session.Status = model.StatusExited
	at.Session.ExitCode = exitCode
	at.Session.UpdatedAt = now

	m.db.Model(&model.TerminalSession{}).Where("id = ?", at.ID).Updates(map[string]any{
		"status":     model.StatusExited,
		"exit_code":  exitCode,
		"updated_at": now,
	})

	at.Connections.Range(func(key, value any) bool {
		conn := value.(*terminalConnection)
		m.sendTerminalState(at, conn.Master)
		m.sendMessage(conn.Master, WSMessage{Type: MsgTypePtyExited})
		return true
	})

	at.historyMu.Lock()
	m.flushHistoryToDB(at)
	at.historyMu.Unlock()
}

func (m *Manager) List() ([]TerminalInfo, error) {
	var sessions []model.TerminalSession
	if err := m.db.Order("updated_at DESC").Find(&sessions).Error; err != nil {
		return nil, err
	}
	result := make([]TerminalInfo, len(sessions))
	for i, s := range sessions {
		result[i] = *sessionToInfo(&s)
	}
	return result, nil
}

func (m *Manager) Attach(id string, conn *websocket.Conn) (*Connection, error) {
	return m.AttachWithOptions(id, conn, AttachOptions{})
}

func (m *Manager) AttachWithOptions(id string, conn *websocket.Conn, opts AttachOptions) (*Connection, error) {
	at, ok := m.getActive(id)
	if !ok {
		return m.sendHistoryOnly(id, conn)
	}

	if m.maxConnections > 0 && int(m.activeConns.Load()) >= m.maxConnections {
		return nil, ErrMaxConnectionsReached
	}

	m.configureWSConn(conn)

	clientID := uuid.New().String()
	mst := newWSMaster(conn, m.wsWriteTimeout)
	ctx, cancel := context.WithCancel(context.Background())
	doneCh := make(chan struct{})

	tc := &terminalConnection{
		ID:     clientID,
		Master: mst,
		Ctx:    ctx,
		Cancel: cancel,
	}
	tc.AckCursor.Store(opts.Cursor)

	at.Connections.Store(clientID, tc)
	m.activeConns.Add(1)

	cleanupOnce := sync.Once{}
	cleanup := func() {
		cleanupOnce.Do(func() {
			at.Connections.Delete(clientID)
			m.activeConns.Add(-1)
			cancel()
			mst.Close()
			close(doneCh)
		})
	}

	if err := m.replayHistory(at, mst, opts.Cursor); err != nil {
		cleanup()
		return nil, err
	}
	if err := m.sendReplayDone(mst); err != nil {
		cleanup()
		return nil, err
	}
	if err := m.sendTerminalState(at, mst); err != nil {
		cleanup()
		return nil, err
	}
	if at.status.Load().(string) != model.StatusRunning {
		if err := m.sendMessage(mst, WSMessage{Type: MsgTypePtyExited}); err != nil {
			cleanup()
			return nil, err
		}
	}

	go func() {
		<-ctx.Done()
		cleanup()
	}()

	go func() {
		defer cleanup()
		_ = m.readClientLoop(at, tc)
	}()

	go func() {
		if err := m.pingLoop(ctx, tc); err != nil {
			cancel()
		}
	}()

	return &Connection{Done: doneCh}, nil
}

func (m *Manager) sendHistoryOnly(id string, conn *websocket.Conn) (*Connection, error) {
	var session model.TerminalSession
	if err := m.db.Where("id = ?", id).First(&session).Error; err != nil {
		return nil, ErrTerminalNotFound
	}

	historyData, err := m.loadHistoryFromDB(id)
	if err != nil {
		return nil, ErrTerminalNotFound
	}

	m.configureWSConn(conn)
	mst := newWSMaster(conn, m.wsWriteTimeout)
	cursor := uint64(len(historyData))

	if len(historyData) > 0 {
		m.sendMessage(mst, WSMessage{
			Type:   MsgTypeReplay,
			Data:   base64.StdEncoding.EncodeToString(historyData),
			Cursor: cursor,
			Reset:  true,
		})
	}
	m.sendReplayDone(mst)
	m.sendMessage(mst, WSMessage{
		Type:     MsgTypeState,
		Status:   session.Status,
		Cols:     session.Cols,
		Rows:     session.Rows,
		Cursor:   cursor,
		ExitCode: session.ExitCode,
	})
	if session.Status != model.StatusRunning {
		m.sendMessage(mst, WSMessage{Type: MsgTypePtyExited})
	}
	mst.Close()

	doneCh := make(chan struct{})
	close(doneCh)
	return &Connection{Done: doneCh}, nil
}

func (m *Manager) replayHistory(at *activeTerminal, mst master, cursor uint64) error {
	snapshot := m.getReplaySnapshot(at, cursor)
	if len(snapshot.data) == 0 && !snapshot.reset {
		return nil
	}
	msg := WSMessage{
		Type:   MsgTypeReplay,
		Data:   base64.StdEncoding.EncodeToString(snapshot.data),
		Cursor: snapshot.cursor,
		Reset:  snapshot.reset,
	}
	return m.sendMessage(mst, msg)
}

func (m *Manager) getReplaySnapshot(at *activeTerminal, cursor uint64) replaySnapshot {
	at.historyMu.RLock()
	data, ok, endCursor := at.historyBuffer.ReadFrom(cursor)
	if ok {
		at.historyMu.RUnlock()
		return replaySnapshot{
			data:   data,
			cursor: endCursor,
			reset:  false,
		}
	}
	historyData := at.historyBuffer.Read()
	_, endCursor = at.historyBuffer.CursorRange()
	at.historyMu.RUnlock()

	return replaySnapshot{
		data:   historyData,
		cursor: endCursor,
		reset:  true,
	}
}

func (m *Manager) sendReplayDone(mst master) error {
	return m.sendMessage(mst, WSMessage{Type: MsgTypeReplayDone})
}

func (m *Manager) sendTerminalState(at *activeTerminal, mst master) error {
	_, cursor := at.historyBuffer.CursorRange()
	msg := WSMessage{
		Type:     MsgTypeState,
		Status:   at.status.Load().(string),
		Cols:     at.Session.Cols,
		Rows:     at.Session.Rows,
		Cursor:   cursor,
		ExitCode: at.Session.ExitCode,
	}
	return m.sendMessage(mst, msg)
}

func (m *Manager) sendMessage(mst master, msg WSMessage) error {
	msgData, err := json.Marshal(msg)
	if err != nil {
		return err
	}
	_, err = mst.Write(msgData)
	return err
}

func (m *Manager) broadcast(at *activeTerminal, msg WSMessage) {
	msgData, err := json.Marshal(msg)
	if err != nil {
		return
	}

	at.Connections.Range(func(key, value any) bool {
		conn := value.(*terminalConnection)
		if _, writeErr := conn.Master.Write(msgData); writeErr != nil {
			conn.Cancel()
		}
		return true
	})
}

func (m *Manager) readClientLoop(at *activeTerminal, conn *terminalConnection) error {
	for {
		select {
		case <-conn.Ctx.Done():
			return conn.Ctx.Err()
		default:
		}

		raw, err := conn.Master.ReadMessage()
		if err != nil {
			return err
		}
		if len(raw) == 0 {
			continue
		}

		var msg WSMessage
		if err := json.Unmarshal(raw, &msg); err != nil {
			continue
		}

		switch msg.Type {
		case MsgTypeInput:
			if at.status.Load().(string) != model.StatusRunning {
				continue
			}
			if msg.Data == "" {
				continue
			}
			decoded, err := at.encoder.DecodeString(msg.Data)
			if err != nil || len(decoded) == 0 {
				continue
			}
			if _, err := at.PTY.Write(decoded); err != nil {
				return err
			}
		case MsgTypeResize:
			if msg.Cols <= 0 || msg.Rows <= 0 {
				continue
			}
			if err := at.PTY.ResizeTerminal(msg.Cols, msg.Rows); err != nil {
				continue
			}
			now := time.Now().Unix()
			at.Session.Cols = msg.Cols
			at.Session.Rows = msg.Rows
			at.Session.UpdatedAt = now
			m.db.Model(&model.TerminalSession{}).Where("id = ?", at.ID).Updates(map[string]any{
				"cols":       msg.Cols,
				"rows":       msg.Rows,
				"updated_at": now,
			})
		case MsgTypeAck:
			if msg.Cursor > conn.AckCursor.Load() {
				conn.AckCursor.Store(msg.Cursor)
			}
		}
	}
}

func (m *Manager) pingLoop(ctx context.Context, conn *terminalConnection) error {
	if m.wsPingInterval <= 0 {
		<-ctx.Done()
		return nil
	}

	ticker := time.NewTicker(m.wsPingInterval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return nil
		case <-ticker.C:
			if err := conn.Master.Ping(); err != nil {
				return err
			}
		}
	}
}

func (m *Manager) configureWSConn(conn *websocket.Conn) {
	if m.bufferSize > 0 {
		conn.SetReadLimit(int64(m.bufferSize * 16))
	}
	if m.wsReadTimeout > 0 {
		_ = conn.SetReadDeadline(time.Now().Add(m.wsReadTimeout))
		conn.SetPongHandler(func(string) error {
			return conn.SetReadDeadline(time.Now().Add(m.wsReadTimeout))
		})
	}
}

func (m *Manager) CleanupOnStart() {
	m.db.Model(&model.TerminalSession{}).Where("status = ?", model.StatusRunning).Updates(map[string]any{
		"status":     model.StatusExited,
		"updated_at": time.Now().Unix(),
	})
}
