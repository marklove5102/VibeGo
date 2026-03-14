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

	files, summary := h.collectStructuredStatus(w.Filesystem.Root())
	h.wsHandler.Broadcast(path, GitWSEvent{
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
