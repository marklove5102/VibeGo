package handler

import (
	"encoding/json"
	"net/http"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"
	"github.com/rs/zerolog/log"
)

type GitWSEvent struct {
	Type string      `json:"type"`
	Data interface{} `json:"data"`
}

type gitWSClient struct {
	conn *websocket.Conn
	path string
	done chan struct{}
	mu   sync.Mutex
}

type GitWSHandler struct {
	upgrader   websocket.Upgrader
	gitHandler *GitHandler
	mu         sync.RWMutex
	clients    map[*gitWSClient]bool
}

func NewGitWSHandler(gitHandler *GitHandler) *GitWSHandler {
	return &GitWSHandler{
		upgrader: websocket.Upgrader{
			CheckOrigin: func(r *http.Request) bool { return true },
		},
		gitHandler: gitHandler,
		clients:    make(map[*gitWSClient]bool),
	}
}

func (h *GitWSHandler) Register(r *gin.RouterGroup) {
	r.GET("/git/ws", h.HandleWS)
}

func (h *GitWSHandler) HandleWS(c *gin.Context) {
	path := c.Query("path")
	if path == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "path is required"})
		return
	}

	conn, err := h.upgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		log.Error().Err(err).Msg("git ws upgrade failed")
		return
	}

	client := &gitWSClient{conn: conn, path: path, done: make(chan struct{})}
	h.mu.Lock()
	h.clients[client] = true
	h.mu.Unlock()

	go h.pollLoop(client)
	go h.readPump(client)

	<-client.done

	h.mu.Lock()
	delete(h.clients, client)
	h.mu.Unlock()
}

func (h *GitWSHandler) readPump(client *gitWSClient) {
	defer func() {
		select {
		case <-client.done:
		default:
			close(client.done)
		}
		client.conn.Close()
	}()
	client.conn.SetReadDeadline(time.Now().Add(120 * time.Second))
	client.conn.SetPongHandler(func(string) error {
		client.conn.SetReadDeadline(time.Now().Add(120 * time.Second))
		return nil
	})
	for {
		_, _, err := client.conn.ReadMessage()
		if err != nil {
			return
		}
	}
}

func (h *GitWSHandler) pollLoop(client *gitWSClient) {
	ticker := time.NewTicker(3 * time.Second)
	pingTicker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()
	defer pingTicker.Stop()

	var lastStatusJSON string
	var lastBranchJSON string

	for {
		select {
		case <-client.done:
			return
		case <-pingTicker.C:
			client.mu.Lock()
			err := client.conn.WriteControl(websocket.PingMessage, nil, time.Now().Add(5*time.Second))
			client.mu.Unlock()
			if err != nil {
				return
			}
		case <-ticker.C:
			repo, err := h.gitHandler.openRepo(client.path)
			if err != nil {
				continue
			}

			files := collectFileStatus(repo)
			data, _ := json.Marshal(files)
			s := string(data)
			if s != lastStatusJSON {
				lastStatusJSON = s
				h.sendEvent(client, GitWSEvent{Type: "file_changed", Data: gin.H{"files": files}})
			}

			repoRoot, err := h.gitHandler.getRepoRoot(client.path)
			if err != nil {
				continue
			}
			bs := collectBranchStatus(repoRoot)
			bData, _ := json.Marshal(bs)
			bStr := string(bData)
			if bStr != lastBranchJSON {
				lastBranchJSON = bStr
				h.sendEvent(client, GitWSEvent{Type: "remote_updated", Data: bs})
			}
		}
	}
}

func (h *GitWSHandler) sendEvent(client *gitWSClient, event GitWSEvent) {
	client.mu.Lock()
	defer client.mu.Unlock()
	client.conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
	if err := client.conn.WriteJSON(event); err != nil {
		log.Debug().Err(err).Msg("git ws send failed")
	}
}

func (h *GitWSHandler) Broadcast(path string, event GitWSEvent) {
	h.mu.RLock()
	defer h.mu.RUnlock()
	for client := range h.clients {
		if client.path == path {
			h.sendEvent(client, event)
		}
	}
}
