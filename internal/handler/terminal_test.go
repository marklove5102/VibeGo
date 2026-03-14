package handler

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/glebarez/sqlite"
	"github.com/gorilla/websocket"
	"github.com/xxnuo/vibego/internal/model"
	"github.com/xxnuo/vibego/internal/service/terminal"
	"gorm.io/gorm"
)

func setupTestHandler(t *testing.T) (*TerminalHandler, func()) {
	tmpDir := t.TempDir()

	db, err := gorm.Open(sqlite.Open(tmpDir+"/test.db"), &gorm.Config{})
	if err != nil {
		t.Fatalf("failed to open database: %v", err)
	}

	if err := db.AutoMigrate(&model.TerminalSession{}, &model.TerminalHistory{}); err != nil {
		t.Fatalf("failed to migrate: %v", err)
	}

	mgr := terminal.NewManager(db, &terminal.ManagerConfig{Shell: os.Getenv("SHELL")})
	handler := &TerminalHandler{manager: mgr}

	cleanup := func() {
		sessions, _ := mgr.List("", "")
		for _, s := range sessions {
			mgr.Close(s.ID)
		}
	}

	return handler, cleanup
}

func TestTerminalHandlerNew(t *testing.T) {
	handler, cleanup := setupTestHandler(t)
	defer cleanup()

	gin.SetMode(gin.TestMode)
	router := gin.New()
	handler.Register(router.Group("/api"))

	reqBody := NewTerminalRequest{
		Name: "test",
		Cols: 80,
		Rows: 24,
	}
	body, _ := json.Marshal(reqBody)

	req := httptest.NewRequest("POST", "/api/terminal", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	router.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("expected status 200, got %d", w.Code)
	}

	var resp map[string]interface{}
	json.Unmarshal(w.Body.Bytes(), &resp)

	if resp["ok"] != true {
		t.Error("expected ok=true")
	}
	if resp["id"] == "" {
		t.Error("expected non-empty id")
	}
}

func TestTerminalHandlerList(t *testing.T) {
	handler, cleanup := setupTestHandler(t)
	defer cleanup()

	info1, _ := handler.manager.Create(terminal.CreateOptions{Name: "test1", Cols: 80, Rows: 24})
	info2, _ := handler.manager.Create(terminal.CreateOptions{Name: "test2", Cols: 80, Rows: 24})

	gin.SetMode(gin.TestMode)
	router := gin.New()
	handler.Register(router.Group("/api"))

	req := httptest.NewRequest("GET", "/api/terminal", nil)
	w := httptest.NewRecorder()

	router.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("expected status 200, got %d", w.Code)
	}

	var resp map[string][]TerminalInfo
	json.Unmarshal(w.Body.Bytes(), &resp)

	terminals := resp["terminals"]
	if len(terminals) < 2 {
		t.Errorf("expected at least 2 terminals, got %d", len(terminals))
	}

	found := false
	for _, term := range terminals {
		if term.ID == info1.ID || term.ID == info2.ID {
			found = true
			if term.Status != model.StatusRunning {
				t.Errorf("expected status %s, got %s", model.StatusRunning, term.Status)
			}
		}
	}

	if !found {
		t.Error("created sessions not found in list")
	}
}

func TestTerminalHandlerCreateWithWorkspaceMetadata(t *testing.T) {
	handler, cleanup := setupTestHandler(t)
	defer cleanup()

	gin.SetMode(gin.TestMode)
	router := gin.New()
	handler.Register(router.Group("/api"))

	reqBody := NewTerminalRequest{
		Name:               "meta",
		Cols:               80,
		Rows:               24,
		WorkspaceSessionID: "session-1",
		GroupID:            "group-1",
		ParentID:           "root-1",
	}
	body, _ := json.Marshal(reqBody)

	req := httptest.NewRequest("POST", "/api/terminal", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	router.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d", w.Code)
	}

	w = httptest.NewRecorder()
	req = httptest.NewRequest("GET", "/api/terminal", nil)
	router.ServeHTTP(w, req)

	var resp map[string][]TerminalInfo
	json.Unmarshal(w.Body.Bytes(), &resp)

	found := false
	for _, term := range resp["terminals"] {
		if term.Name != "meta" {
			continue
		}
		found = true
		if term.WorkspaceSessionID != "session-1" {
			t.Fatalf("expected workspace_session_id session-1, got %s", term.WorkspaceSessionID)
		}
		if term.GroupID != "group-1" {
			t.Fatalf("expected group_id group-1, got %s", term.GroupID)
		}
		if term.ParentID != "root-1" {
			t.Fatalf("expected parent_id root-1, got %s", term.ParentID)
		}
	}

	if !found {
		t.Fatal("created session with metadata not found")
	}
}

func TestTerminalHandlerListByWorkspaceSession(t *testing.T) {
	handler, cleanup := setupTestHandler(t)
	defer cleanup()

	_, _ = handler.manager.Create(terminal.CreateOptions{
		Name:               "session-1-terminal",
		Cols:               80,
		Rows:               24,
		WorkspaceSessionID: "session-1",
		GroupID:            "group-1",
	})
	_, _ = handler.manager.Create(terminal.CreateOptions{
		Name:               "session-2-terminal",
		Cols:               80,
		Rows:               24,
		WorkspaceSessionID: "session-2",
		GroupID:            "group-2",
	})

	gin.SetMode(gin.TestMode)
	router := gin.New()
	handler.Register(router.Group("/api"))

	req := httptest.NewRequest("GET", "/api/terminal?workspace_session_id=session-1", nil)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d", w.Code)
	}

	var resp map[string][]TerminalInfo
	json.Unmarshal(w.Body.Bytes(), &resp)
	terminals := resp["terminals"]
	if len(terminals) != 1 {
		t.Fatalf("expected 1 terminal, got %d", len(terminals))
	}
	if terminals[0].WorkspaceSessionID != "session-1" {
		t.Fatalf("expected workspace_session_id session-1, got %s", terminals[0].WorkspaceSessionID)
	}
}

func TestTerminalHandlerClose(t *testing.T) {
	handler, cleanup := setupTestHandler(t)
	defer cleanup()

	info, _ := handler.manager.Create(terminal.CreateOptions{Name: "test", Cols: 80, Rows: 24})

	gin.SetMode(gin.TestMode)
	router := gin.New()
	handler.Register(router.Group("/api"))

	reqBody := CloseTerminalRequest{ID: info.ID}
	body, _ := json.Marshal(reqBody)

	req := httptest.NewRequest("POST", "/api/terminal/close", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	router.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("expected status 200, got %d", w.Code)
	}

	_, ok := handler.manager.Get(info.ID)
	if ok {
		t.Error("expected session to be closed")
	}
}

func TestTerminalHandlerRename(t *testing.T) {
	handler, cleanup := setupTestHandler(t)
	defer cleanup()

	info, _ := handler.manager.Create(terminal.CreateOptions{Name: "test", Cols: 80, Rows: 24})

	gin.SetMode(gin.TestMode)
	router := gin.New()
	handler.Register(router.Group("/api"))

	reqBody := RenameTerminalRequest{ID: info.ID, Name: "renamed"}
	body, _ := json.Marshal(reqBody)

	req := httptest.NewRequest("POST", "/api/terminal/rename", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	router.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("expected status 200, got %d", w.Code)
	}

	sessions, _ := handler.manager.List("", "")
	found := false
	for _, session := range sessions {
		if session.ID == info.ID {
			found = true
			if session.Name != "renamed" {
				t.Errorf("expected renamed terminal, got %s", session.Name)
			}
		}
	}

	if !found {
		t.Fatal("renamed session not found")
	}
}

func TestTerminalHandlerWebSocket(t *testing.T) {
	handler, cleanup := setupTestHandler(t)

	info, _ := handler.manager.Create(terminal.CreateOptions{Name: "test", Cols: 80, Rows: 24})

	gin.SetMode(gin.TestMode)
	router := gin.New()
	handler.Register(router.Group("/api"))

	server := httptest.NewServer(router)

	wsURL := "ws" + server.URL[4:] + "/api/terminal/ws/" + info.ID

	conn, _, err := websocket.DefaultDialer.Dial(wsURL, nil)
	if err != nil {
		t.Fatalf("failed to connect websocket: %v", err)
	}

	time.Sleep(100 * time.Millisecond)

	_, ok := handler.manager.Get(info.ID)
	if !ok {
		t.Fatal("session not found")
	}

	conn.Close()
	cleanup()
	server.Close()
	time.Sleep(200 * time.Millisecond)
}

func TestTerminalHistoryPersistence(t *testing.T) {
	handler, cleanup := setupTestHandler(t)
	defer cleanup()

	info, _ := handler.manager.Create(terminal.CreateOptions{Name: "test", Cols: 80, Rows: 24})

	sessions, _ := handler.manager.List("", "")
	var found *terminal.TerminalInfo
	for i, s := range sessions {
		if s.ID == info.ID {
			found = &sessions[i]
			break
		}
	}

	if found == nil {
		t.Fatal("session not found")
	}

	if found.Status != model.StatusRunning {
		t.Errorf("expected status %s, got %s", model.StatusRunning, found.Status)
	}
}
