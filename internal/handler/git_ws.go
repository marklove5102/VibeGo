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
	conn               *websocket.Conn
	path               string
	workspaceSessionID string
	groupID            string
	done               chan struct{}
	mu                 sync.Mutex
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
	client.workspaceSessionID = c.Query("workspace_session_id")
	client.groupID = c.Query("group_id")
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
	ticker := time.NewTicker(2 * time.Second)
	pingTicker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()
	defer pingTicker.Stop()

	var lastStatusJSON string
	var lastBranchJSON string
	var lastHeadHash string
	var lastBranchesJSON string
	var lastRemotesJSON string
	var lastStashesJSON string
	var lastConflictsJSON string

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
			repoRoot, err := h.gitHandler.getRepoRoot(client.path)
			if err != nil {
				continue
			}

			scopeKey := buildGitScopeKey(client.workspaceSessionID, client.groupID, repoRoot)
			files, summary := h.gitHandler.collectStructuredStatusWithScope(repoRoot, scopeKey)
			payload := gin.H{"files": files, "summary": summary}
			data, _ := json.Marshal(payload)
			s := string(data)
			if s != lastStatusJSON {
				lastStatusJSON = s
				h.sendEvent(client, GitWSEvent{Type: "file_changed", Data: payload})
			}

			bs := collectBranchStatus(repoRoot)
			bData, _ := json.Marshal(bs)
			bStr := string(bData)
			if bStr != lastBranchJSON {
				lastBranchJSON = bStr
				h.sendEvent(client, GitWSEvent{Type: "remote_updated", Data: bs})
			}

			syncData := gin.H{}

			headHash := collectHeadHash(repoRoot)
			if headHash != lastHeadHash {
				lastHeadHash = headHash
				syncData["history"] = true
			}

			branches := collectBranchesSnapshot(repoRoot)
			branchesData, _ := json.Marshal(branches)
			branchesStr := string(branchesData)
			if branchesStr != lastBranchesJSON {
				lastBranchesJSON = branchesStr
				syncData["branches"] = true
			}

			remotes := collectRemoteInfos(repoRoot)
			remotesData, _ := json.Marshal(remotes)
			remotesStr := string(remotesData)
			if remotesStr != lastRemotesJSON {
				lastRemotesJSON = remotesStr
				syncData["remotes"] = true
			}

			stashes := collectStashEntries(repoRoot)
			stashesData, _ := json.Marshal(stashes)
			stashesStr := string(stashesData)
			if stashesStr != lastStashesJSON {
				lastStashesJSON = stashesStr
				syncData["stashes"] = true
			}

			conflicts := collectConflictFiles(repoRoot)
			conflictsData, _ := json.Marshal(conflicts)
			conflictsStr := string(conflictsData)
			if conflictsStr != lastConflictsJSON {
				lastConflictsJSON = conflictsStr
				syncData["conflicts"] = true
			}

			if len(syncData) > 0 {
				h.sendEvent(client, GitWSEvent{Type: "repo_sync_needed", Data: syncData})
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

func (h *GitWSHandler) BroadcastScoped(path string, workspaceSessionID string, groupID string, event GitWSEvent) {
	h.mu.RLock()
	defer h.mu.RUnlock()
	for client := range h.clients {
		if client.path != path {
			continue
		}
		if workspaceSessionID != "" && client.workspaceSessionID != workspaceSessionID {
			continue
		}
		if groupID != "" && client.groupID != groupID {
			continue
		}
		h.sendEvent(client, event)
	}
}

func (h *GitWSHandler) BroadcastStatusByPath(path string, build func(workspaceSessionID string, groupID string) GitWSEvent) {
	h.mu.RLock()
	defer h.mu.RUnlock()
	for client := range h.clients {
		if client.path != path {
			continue
		}
		h.sendEvent(client, build(client.workspaceSessionID, client.groupID))
	}
}
