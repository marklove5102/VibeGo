package terminal

import (
	"sync"
	"time"

	"github.com/gorilla/websocket"
)

type master interface {
	ReadMessage() (data []byte, err error)
	Write(p []byte) (n int, err error)
	Ping() error
	Close() error
}

type wsMaster struct {
	conn         *websocket.Conn
	mu           sync.Mutex
	writeTimeout time.Duration
}

func newWSMaster(conn *websocket.Conn, writeTimeout time.Duration) *wsMaster {
	return &wsMaster{
		conn:         conn,
		writeTimeout: writeTimeout,
	}
}

func (m *wsMaster) ReadMessage() ([]byte, error) {
	for {
		msgType, data, err := m.conn.ReadMessage()
		if err != nil {
			return nil, err
		}
		if msgType == websocket.TextMessage || msgType == websocket.BinaryMessage {
			return data, nil
		}
	}
}

func (m *wsMaster) Write(p []byte) (int, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	if m.writeTimeout > 0 {
		if err := m.conn.SetWriteDeadline(time.Now().Add(m.writeTimeout)); err != nil {
			return 0, err
		}
	}
	err := m.conn.WriteMessage(websocket.TextMessage, p)
	if err != nil {
		return 0, err
	}
	return len(p), nil
}

func (m *wsMaster) Ping() error {
	m.mu.Lock()
	defer m.mu.Unlock()

	deadline := time.Now().Add(5 * time.Second)
	if m.writeTimeout > 0 {
		deadline = time.Now().Add(m.writeTimeout)
	}
	if err := m.conn.SetWriteDeadline(deadline); err != nil {
		return err
	}
	return m.conn.WriteControl(websocket.PingMessage, nil, deadline)
}

func (m *wsMaster) Close() error {
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.conn.Close()
}
