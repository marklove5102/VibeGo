package handler

import "github.com/gin-gonic/gin"

func (h *GitHandler) broadcastStatus(path string) {
	if h == nil || h.wsHandler == nil || path == "" {
		return
	}

	repo, err := h.openRepo(path)
	if err != nil {
		return
	}

	w, err := repo.Worktree()
	if err != nil {
		return
	}

	repoRoot := w.Filesystem.Root()
	h.wsHandler.BroadcastStatusByPath(path, func(workspaceSessionID string, groupID string) GitWSEvent {
		scopeKey := buildGitScopeKey(workspaceSessionID, groupID, repoRoot)
		files, summary := h.collectStructuredStatusWithScope(repoRoot, scopeKey)
		return GitWSEvent{
			Type: "file_changed",
			Data: gin.H{
				"files":   files,
				"summary": summary,
			},
		}
	})
}

func (h *GitHandler) broadcastStatusScoped(path string, workspaceSessionID string, groupID string) {
	if h == nil || h.wsHandler == nil || path == "" {
		return
	}

	repo, err := h.openRepo(path)
	if err != nil {
		return
	}

	w, err := repo.Worktree()
	if err != nil {
		return
	}

	repoRoot := w.Filesystem.Root()
	scopeKey := buildGitScopeKey(workspaceSessionID, groupID, repoRoot)
	files, summary := h.collectStructuredStatusWithScope(repoRoot, scopeKey)
	h.wsHandler.BroadcastScoped(path, workspaceSessionID, groupID, GitWSEvent{
		Type: "file_changed",
		Data: gin.H{
			"files":   files,
			"summary": summary,
		},
	})
}

func (h *GitHandler) broadcastBranchStatus(path string) {
	if h == nil || h.wsHandler == nil || path == "" {
		return
	}

	repoRoot, err := h.getRepoRoot(path)
	if err != nil {
		return
	}

	h.wsHandler.Broadcast(path, GitWSEvent{
		Type: "remote_updated",
		Data: collectBranchStatus(repoRoot),
	})
}

func (h *GitHandler) broadcastRepoSyncNeeded(path string, syncData gin.H) {
	if h == nil || h.wsHandler == nil || path == "" || len(syncData) == 0 {
		return
	}

	h.wsHandler.Broadcast(path, GitWSEvent{
		Type: "repo_sync_needed",
		Data: syncData,
	})
}

func (h *GitHandler) broadcastRepoSyncNeededScoped(path string, workspaceSessionID string, groupID string, syncData gin.H) {
	if h == nil || h.wsHandler == nil || path == "" || len(syncData) == 0 {
		return
	}

	h.wsHandler.BroadcastScoped(path, workspaceSessionID, groupID, GitWSEvent{
		Type: "repo_sync_needed",
		Data: syncData,
	})
}
