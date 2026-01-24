package handler

import (
	"bytes"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/go-git/go-git/v6"
	"github.com/go-git/go-git/v6/plumbing"
	"github.com/go-git/go-git/v6/plumbing/object"
	"github.com/go-git/go-git/v6/utils/merkletrie"
	"github.com/xxnuo/vibego/internal/service/settings"
	"gorm.io/gorm"
)

type GitHandler struct {
	settings *settings.Store
}

func NewGitHandler(db *gorm.DB) *GitHandler {
	h := &GitHandler{}
	if db != nil {
		h.settings = settings.New(db)
	}
	return h
}

func (h *GitHandler) getGitAuthor() (string, string) {
	author := ""
	email := ""
	if h.settings != nil {
		author, _ = h.settings.Get("gitUserName")
		email, _ = h.settings.Get("gitUserEmail")
	}
	if author == "" {
		author = "VibeGo User"
	}
	if email == "" {
		email = "user@vibego.local"
	}
	return author, email
}

func (h *GitHandler) Register(r *gin.RouterGroup) {
	g := r.Group("/git")
	g.POST("/init", h.Init)
	g.POST("/clone", h.Clone)
	g.POST("/status", h.Status)
	g.POST("/log", h.Log)
	g.POST("/diff", h.Diff)
	g.POST("/show", h.Show)
	g.POST("/add", h.Add)
	g.POST("/reset", h.Reset)
	g.POST("/checkout", h.Checkout)
	g.POST("/commit", h.Commit)
	g.POST("/undo", h.UndoCommit)
	g.POST("/branches", h.Branches)
	g.POST("/switch-branch", h.SwitchBranch)
	g.POST("/commit-files", h.CommitFiles)
	g.POST("/commit-diff", h.CommitDiff)
	g.POST("/remotes", h.Remotes)
	g.POST("/fetch", h.Fetch)
	g.POST("/pull", h.Pull)
	g.POST("/push", h.Push)
	g.POST("/stash", h.Stash)
	g.POST("/stash-list", h.StashList)
	g.POST("/stash-pop", h.StashPop)
	g.POST("/stash-drop", h.StashDrop)
	g.POST("/conflicts", h.Conflicts)
	g.POST("/resolve-conflict", h.ResolveConflict)
	g.POST("/create-branch", h.CreateBranch)
	g.POST("/delete-branch", h.DeleteBranch)
	g.POST("/add-patch", h.AddPatch)
	g.POST("/commit-selected", h.CommitSelected)
	g.POST("/amend", h.Amend)
	g.POST("/branch-status", h.BranchStatus)
	g.POST("/smart-switch-branch", h.SmartSwitchBranch)
}

func (h *GitHandler) openRepo(path string) (*git.Repository, error) {
	return git.PlainOpenWithOptions(path, &git.PlainOpenOptions{DetectDotGit: true})
}

type GitInitRequest struct {
	Path string `json:"path" binding:"required"`
}

// Init godoc
// @Summary Initialize git repository
// @Description Initialize a new git repository
// @Tags Git
// @Accept json
// @Produce json
// @Param request body GitInitRequest true "Init request"
// @Success 200 {object} map[string]bool
// @Failure 400 {object} map[string]string
// @Failure 500 {object} map[string]string
// @Router /api/git/init [post]
func (h *GitHandler) Init(c *gin.Context) {
	var req GitInitRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	_, err := git.PlainInit(req.Path, false)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"ok": true})
}

type GitCloneRequest struct {
	URL  string `json:"url" binding:"required"`
	Path string `json:"path" binding:"required"`
}

// Clone godoc
// @Summary Clone git repository
// @Description Clone a git repository from URL
// @Tags Git
// @Accept json
// @Produce json
// @Param request body GitCloneRequest true "Clone request"
// @Success 200 {object} map[string]bool
// @Failure 400 {object} map[string]string
// @Failure 500 {object} map[string]string
// @Router /api/git/clone [post]
func (h *GitHandler) Clone(c *gin.Context) {
	var req GitCloneRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	_, err := git.PlainClone(req.Path, &git.CloneOptions{
		URL:      req.URL,
		Progress: os.Stdout,
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"ok": true})
}

type GitPathRequest struct {
	Path string `json:"path" binding:"required"`
}

type FileStatus struct {
	Path   string `json:"path"`
	Status string `json:"status"`
	Staged bool   `json:"staged"`
}

// Status godoc
// @Summary Get git status
// @Description Get the status of files in the repository
// @Tags Git
// @Accept json
// @Produce json
// @Param request body GitPathRequest true "Path request"
// @Success 200 {object} map[string]interface{}
// @Failure 400 {object} map[string]string
// @Failure 500 {object} map[string]string
// @Router /api/git/status [post]
func (h *GitHandler) Status(c *gin.Context) {
	var req GitPathRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	repo, err := h.openRepo(req.Path)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	w, err := repo.Worktree()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	status, err := w.Status()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	var fileStatuses []FileStatus
	for path, s := range status {
		if s.Staging == git.Untracked && s.Worktree == git.Untracked {
			fileStatuses = append(fileStatuses, FileStatus{
				Path:   path,
				Status: string(s.Worktree),
				Staged: false,
			})
			continue
		}
		if s.Staging != git.Unmodified && s.Staging != git.Untracked {
			fileStatuses = append(fileStatuses, FileStatus{
				Path:   path,
				Status: string(s.Staging),
				Staged: true,
			})
		}
		if s.Worktree != git.Unmodified && s.Worktree != git.Untracked {
			fileStatuses = append(fileStatuses, FileStatus{
				Path:   path,
				Status: string(s.Worktree),
				Staged: false,
			})
		}
	}

	sort.Slice(fileStatuses, func(i, j int) bool {
		return fileStatuses[i].Path < fileStatuses[j].Path
	})

	c.JSON(http.StatusOK, gin.H{"files": fileStatuses})
}

type GitLogRequest struct {
	Path  string `json:"path" binding:"required"`
	Limit int    `json:"limit"`
}

type CommitInfo struct {
	Hash    string `json:"hash"`
	Message string `json:"message"`
	Author  string `json:"author"`
	Date    string `json:"date"`
}

// Log godoc
// @Summary Get git log
// @Description Get commit history
// @Tags Git
// @Accept json
// @Produce json
// @Param request body GitLogRequest true "Log request"
// @Success 200 {object} map[string]interface{}
// @Failure 400 {object} map[string]string
// @Failure 500 {object} map[string]string
// @Router /api/git/log [post]
func (h *GitHandler) Log(c *gin.Context) {
	var req GitLogRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	repo, err := h.openRepo(req.Path)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	ref, err := repo.Head()
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"commits": []CommitInfo{}})
		return
	}

	cIter, err := repo.Log(&git.LogOptions{From: ref.Hash()})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	var commits []CommitInfo
	limit := req.Limit
	if limit <= 0 {
		limit = 20
	}
	count := 0

	err = cIter.ForEach(func(commit *object.Commit) error {
		if count >= limit {
			return io.EOF
		}
		commits = append(commits, CommitInfo{
			Hash:    commit.Hash.String(),
			Message: commit.Message,
			Author:  commit.Author.Name,
			Date:    commit.Author.When.Format(time.RFC3339),
		})
		count++
		return nil
	})
	if err != nil && err != io.EOF {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"commits": commits})
}

type GitDiffRequest struct {
	Path     string `json:"path" binding:"required"`
	FilePath string `json:"filePath" binding:"required"`
}

// Diff godoc
// @Summary Get file diff
// @Description Get diff between working tree and HEAD for a file
// @Tags Git
// @Accept json
// @Produce json
// @Param request body GitDiffRequest true "Diff request"
// @Success 200 {object} map[string]interface{}
// @Failure 400 {object} map[string]string
// @Failure 500 {object} map[string]string
// @Router /api/git/diff [post]
func (h *GitHandler) Diff(c *gin.Context) {
	var req GitDiffRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	repo, err := h.openRepo(req.Path)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	var oldContent string
	headRef, err := repo.Head()
	if err == nil {
		headCommit, err := repo.CommitObject(headRef.Hash())
		if err == nil {
			tree, err := headCommit.Tree()
			if err == nil {
				file, err := tree.File(req.FilePath)
				if err == nil {
					r, err := file.Reader()
					if err == nil {
						buf := new(bytes.Buffer)
						buf.ReadFrom(r)
						oldContent = buf.String()
						r.Close()
					}
				}
			}
		}
	}

	w, err := repo.Worktree()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	absPath := filepath.Join(w.Filesystem.Root(), req.FilePath)
	newContentBytes, err := os.ReadFile(absPath)
	if err != nil {
		newContentBytes = []byte{}
	}

	c.JSON(http.StatusOK, gin.H{
		"path": req.FilePath,
		"old":  oldContent,
		"new":  string(newContentBytes),
	})
}

type GitShowRequest struct {
	Path     string `json:"path" binding:"required"`
	FilePath string `json:"filePath" binding:"required"`
	Ref      string `json:"ref"`
}

// Show godoc
// @Summary Show file at ref
// @Description Get file content at a specific ref
// @Tags Git
// @Accept json
// @Produce json
// @Param request body GitShowRequest true "Show request"
// @Success 200 {object} map[string]string
// @Failure 400 {object} map[string]string
// @Failure 404 {object} map[string]string
// @Failure 500 {object} map[string]string
// @Router /api/git/show [post]
func (h *GitHandler) Show(c *gin.Context) {
	var req GitShowRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if req.Ref == "" {
		req.Ref = "HEAD"
	}

	repo, err := h.openRepo(req.Path)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	hash, err := repo.ResolveRevision(plumbing.Revision(req.Ref))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid ref: " + err.Error()})
		return
	}

	commit, err := repo.CommitObject(*hash)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	tree, err := commit.Tree()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	file, err := tree.File(req.FilePath)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "file not found"})
		return
	}

	r, err := file.Reader()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	defer r.Close()

	buf := new(bytes.Buffer)
	buf.ReadFrom(r)

	c.JSON(http.StatusOK, gin.H{"content": buf.String()})
}

type GitFilesRequest struct {
	Path  string   `json:"path" binding:"required"`
	Files []string `json:"files" binding:"required"`
}

// Add godoc
// @Summary Stage files
// @Description Add files to git staging area
// @Tags Git
// @Accept json
// @Produce json
// @Param request body GitFilesRequest true "Add request"
// @Success 200 {object} map[string]bool
// @Failure 400 {object} map[string]string
// @Failure 500 {object} map[string]string
// @Router /api/git/add [post]
func (h *GitHandler) Add(c *gin.Context) {
	var req GitFilesRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	repo, err := h.openRepo(req.Path)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	w, err := repo.Worktree()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	for _, file := range req.Files {
		if _, err := w.Add(file); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to add " + file + ": " + err.Error()})
			return
		}
	}

	c.JSON(http.StatusOK, gin.H{"ok": true})
}

type GitResetRequest struct {
	Path  string   `json:"path" binding:"required"`
	Files []string `json:"files"`
}

// Reset godoc
// @Summary Unstage files
// @Description Reset files from staging area
// @Tags Git
// @Accept json
// @Produce json
// @Param request body GitResetRequest true "Reset request"
// @Success 200 {object} map[string]bool
// @Failure 400 {object} map[string]string
// @Failure 500 {object} map[string]string
// @Router /api/git/reset [post]
func (h *GitHandler) Reset(c *gin.Context) {
	var req GitResetRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	repo, err := h.openRepo(req.Path)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	w, err := repo.Worktree()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	head, err := repo.Head()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "cannot reset without HEAD"})
		return
	}
	resetOpts := &git.ResetOptions{Commit: head.Hash(), Mode: git.MixedReset}
	if len(req.Files) > 0 {
		resetOpts.Files = req.Files
	}
	if err := w.Reset(resetOpts); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"ok": true})
}

// Checkout godoc
// @Summary Checkout files
// @Description Discard changes in working directory
// @Tags Git
// @Accept json
// @Produce json
// @Param request body GitFilesRequest true "Checkout request"
// @Success 200 {object} map[string]bool
// @Failure 400 {object} map[string]string
// @Failure 500 {object} map[string]string
// @Router /api/git/checkout [post]
func (h *GitHandler) Checkout(c *gin.Context) {
	var req GitFilesRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	repo, err := h.openRepo(req.Path)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	idx, err := repo.Storer.Index()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	w, err := repo.Worktree()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	baseDir := w.Filesystem.Root()

	for _, p := range req.Files {
		entry, err := idx.Entry(p)
		if err != nil {
			absP := filepath.Join(baseDir, p)
			if _, e := os.Stat(absP); e == nil {
				os.Remove(absP)
			}
			continue
		}

		blob, err := repo.BlobObject(entry.Hash)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "blob not found: " + err.Error()})
			return
		}

		content, err := func() ([]byte, error) {
			r, err := blob.Reader()
			if err != nil {
				return nil, err
			}
			defer r.Close()
			return io.ReadAll(r)
		}()
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "read error: " + err.Error()})
			return
		}

		absP := filepath.Join(baseDir, p)
		if err := os.WriteFile(absP, content, 0644); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "write error: " + err.Error()})
			return
		}
	}

	repo2, _ := h.openRepo(req.Path)
	checkoutFiles := collectFileStatus(repo2)
	c.JSON(http.StatusOK, gin.H{"ok": true, "status": gin.H{"files": checkoutFiles}})
}

type GitCommitRequest struct {
	Path    string `json:"path" binding:"required"`
	Message string `json:"message" binding:"required"`
	Author  string `json:"author"`
	Email   string `json:"email"`
}

// Commit godoc
// @Summary Create commit
// @Description Commit staged changes
// @Tags Git
// @Accept json
// @Produce json
// @Param request body GitCommitRequest true "Commit request"
// @Success 200 {object} map[string]interface{}
// @Failure 400 {object} map[string]string
// @Failure 500 {object} map[string]string
// @Router /api/git/commit [post]
func (h *GitHandler) Commit(c *gin.Context) {
	var req GitCommitRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	repo, err := h.openRepo(req.Path)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	w, err := repo.Worktree()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	author, email := h.getGitAuthor()
	if req.Author != "" {
		author = req.Author
	}
	if req.Email != "" {
		email = req.Email
	}

	hash, err := w.Commit(req.Message, &git.CommitOptions{
		Author: &object.Signature{
			Name:  author,
			Email: email,
			When:  time.Now(),
		},
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"ok": true, "hash": hash.String()})
}

// UndoCommit godoc
// @Summary Undo last commit
// @Description Soft reset to parent commit
// @Tags Git
// @Accept json
// @Produce json
// @Param request body GitPathRequest true "Path request"
// @Success 200 {object} map[string]bool
// @Failure 400 {object} map[string]string
// @Failure 500 {object} map[string]string
// @Router /api/git/undo [post]
func (h *GitHandler) UndoCommit(c *gin.Context) {
	var req GitPathRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	repo, err := h.openRepo(req.Path)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	w, err := repo.Worktree()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	head, err := repo.Head()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "cannot find HEAD"})
		return
	}

	commit, err := repo.CommitObject(head.Hash())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	if commit.NumParents() == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "initial commit cannot be undone"})
		return
	}

	parent, err := commit.Parent(0)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	if err := w.Reset(&git.ResetOptions{
		Commit: parent.Hash,
		Mode:   git.SoftReset,
	}); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	repo2, _ := h.openRepo(req.Path)
	undoFiles := collectFileStatus(repo2)
	undoCommits := collectCommitLog(repo2, 20)
	c.JSON(http.StatusOK, gin.H{"ok": true, "status": gin.H{"files": undoFiles}, "commits": undoCommits})
}

type CommitSelectedRequest struct {
	Path        string   `json:"path" binding:"required"`
	Files       []string `json:"files" binding:"required"`
	Summary     string   `json:"summary" binding:"required"`
	Description string   `json:"description"`
	Author      string   `json:"author"`
	Email       string   `json:"email"`
}

func (h *GitHandler) CommitSelected(c *gin.Context) {
	var req CommitSelectedRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	repo, err := h.openRepo(req.Path)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	w, err := repo.Worktree()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	head, err := repo.Head()
	if err == nil {
		_ = w.Reset(&git.ResetOptions{Commit: head.Hash(), Mode: git.MixedReset})
	}

	for _, file := range req.Files {
		if _, err := w.Add(file); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to add " + file + ": " + err.Error()})
			return
		}
	}

	message := req.Summary
	if req.Description != "" {
		message += "\n\n" + req.Description
	}

	author, email := h.getGitAuthor()
	if req.Author != "" {
		author = req.Author
	}
	if req.Email != "" {
		email = req.Email
	}

	hash, err := w.Commit(message, &git.CommitOptions{
		Author: &object.Signature{Name: author, Email: email, When: time.Now()},
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	repo, _ = h.openRepo(req.Path)
	files := collectFileStatus(repo)
	commits := collectCommitLog(repo, 20)
	repoRoot, _ := h.getRepoRoot(req.Path)
	bs := collectBranchStatus(repoRoot)

	c.JSON(http.StatusOK, gin.H{
		"ok": true, "hash": hash.String(),
		"status": gin.H{"files": files}, "commits": commits, "branchStatus": bs,
	})
}

func (h *GitHandler) Amend(c *gin.Context) {
	var req CommitSelectedRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	repo, err := h.openRepo(req.Path)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	w, err := repo.Worktree()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	head, err := repo.Head()
	if err == nil {
		_ = w.Reset(&git.ResetOptions{Commit: head.Hash(), Mode: git.MixedReset})
	}

	for _, file := range req.Files {
		if _, err := w.Add(file); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to add " + file + ": " + err.Error()})
			return
		}
	}

	message := req.Summary
	if req.Description != "" {
		message += "\n\n" + req.Description
	}

	author, email := h.getGitAuthor()
	if req.Author != "" {
		author = req.Author
	}
	if req.Email != "" {
		email = req.Email
	}

	_, err = w.Commit(message, &git.CommitOptions{
		Amend:  true,
		Author: &object.Signature{Name: author, Email: email, When: time.Now()},
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	repoRoot, _ := h.getRepoRoot(req.Path)
	repo, _ = h.openRepo(req.Path)
	files := collectFileStatus(repo)
	commits := collectCommitLog(repo, 20)
	bs := collectBranchStatus(repoRoot)

	c.JSON(http.StatusOK, gin.H{
		"ok": true, "status": gin.H{"files": files}, "commits": commits, "branchStatus": bs,
	})
}

type GitCommitFilesRequest struct {
	Path   string `json:"path" binding:"required"`
	Commit string `json:"commit" binding:"required"`
}

type CommitFileInfo struct {
	Path   string `json:"path"`
	Status string `json:"status"`
}

// CommitFiles godoc
// @Summary Get commit files
// @Description Get list of changed files in a specific commit
// @Tags Git
// @Accept json
// @Produce json
// @Param request body GitCommitFilesRequest true "Commit files request"
// @Success 200 {object} map[string]interface{}
// @Failure 400 {object} map[string]string
// @Failure 500 {object} map[string]string
// @Router /api/git/commit-files [post]
func (h *GitHandler) CommitFiles(c *gin.Context) {
	var req GitCommitFilesRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	repo, err := h.openRepo(req.Path)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	hash := plumbing.NewHash(req.Commit)
	commit, err := repo.CommitObject(hash)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "commit not found: " + err.Error()})
		return
	}

	var files []CommitFileInfo

	if commit.NumParents() == 0 {
		tree, err := commit.Tree()
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		tree.Files().ForEach(func(f *object.File) error {
			files = append(files, CommitFileInfo{Path: f.Name, Status: "A"})
			return nil
		})
	} else {
		parent, err := commit.Parent(0)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}

		parentTree, err := parent.Tree()
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}

		commitTree, err := commit.Tree()
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}

		changes, err := parentTree.Diff(commitTree)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}

		for _, change := range changes {
			action, err := change.Action()
			if err != nil {
				continue
			}
			var status string
			var path string
			switch action {
			case merkletrie.Insert:
				status = "A"
				path = change.To.Name
			case merkletrie.Delete:
				status = "D"
				path = change.From.Name
			case merkletrie.Modify:
				status = "M"
				path = change.To.Name
			}
			if path != "" {
				files = append(files, CommitFileInfo{Path: path, Status: status})
			}
		}
	}

	sort.Slice(files, func(i, j int) bool {
		return files[i].Path < files[j].Path
	})

	c.JSON(http.StatusOK, gin.H{"files": files})
}

type GitCommitDiffRequest struct {
	Path     string `json:"path" binding:"required"`
	Commit   string `json:"commit" binding:"required"`
	FilePath string `json:"filePath" binding:"required"`
}

// CommitDiff godoc
// @Summary Get commit file diff
// @Description Get diff of a specific file in a commit compared to its parent
// @Tags Git
// @Accept json
// @Produce json
// @Param request body GitCommitDiffRequest true "Commit diff request"
// @Success 200 {object} map[string]interface{}
// @Failure 400 {object} map[string]string
// @Failure 500 {object} map[string]string
// @Router /api/git/commit-diff [post]
func (h *GitHandler) CommitDiff(c *gin.Context) {
	var req GitCommitDiffRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	repo, err := h.openRepo(req.Path)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	hash := plumbing.NewHash(req.Commit)
	commit, err := repo.CommitObject(hash)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "commit not found: " + err.Error()})
		return
	}

	var oldContent, newContent string

	commitTree, err := commit.Tree()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	file, err := commitTree.File(req.FilePath)
	if err == nil {
		r, err := file.Reader()
		if err == nil {
			buf := new(bytes.Buffer)
			buf.ReadFrom(r)
			newContent = buf.String()
			r.Close()
		}
	}

	if commit.NumParents() > 0 {
		parent, err := commit.Parent(0)
		if err == nil {
			parentTree, err := parent.Tree()
			if err == nil {
				file, err := parentTree.File(req.FilePath)
				if err == nil {
					r, err := file.Reader()
					if err == nil {
						buf := new(bytes.Buffer)
						buf.ReadFrom(r)
						oldContent = buf.String()
						r.Close()
					}
				}
			}
		}
	}

	c.JSON(http.StatusOK, gin.H{
		"path": req.FilePath,
		"old":  oldContent,
		"new":  newContent,
	})
}

type RemoteInfo struct {
	Name string   `json:"name"`
	URLs []string `json:"urls"`
}

// Remotes godoc
// @Summary List remotes
// @Description Get list of remote repositories
// @Tags Git
// @Accept json
// @Produce json
// @Param request body GitPathRequest true "Path request"
// @Success 200 {object} map[string]interface{}
// @Failure 400 {object} map[string]string
// @Failure 500 {object} map[string]string
// @Router /api/git/remotes [post]
func (h *GitHandler) Remotes(c *gin.Context) {
	var req GitPathRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	repo, err := h.openRepo(req.Path)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	remotes, err := repo.Remotes()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	var result []RemoteInfo
	for _, r := range remotes {
		cfg := r.Config()
		result = append(result, RemoteInfo{
			Name: cfg.Name,
			URLs: cfg.URLs,
		})
	}

	c.JSON(http.StatusOK, gin.H{"remotes": result})
}

type GitFetchRequest struct {
	Path   string `json:"path" binding:"required"`
	Remote string `json:"remote"`
}

// Fetch godoc
// @Summary Fetch from remote
// @Description Fetch updates from a remote repository
// @Tags Git
// @Accept json
// @Produce json
// @Param request body GitFetchRequest true "Fetch request"
// @Success 200 {object} map[string]bool
// @Failure 400 {object} map[string]string
// @Failure 500 {object} map[string]string
// @Router /api/git/fetch [post]
func (h *GitHandler) Fetch(c *gin.Context) {
	var req GitFetchRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	repo, err := h.openRepo(req.Path)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	remoteName := req.Remote
	if remoteName == "" {
		remoteName = "origin"
	}

	err = repo.Fetch(&git.FetchOptions{
		RemoteName: remoteName,
		Progress:   os.Stdout,
	})
	if err != nil && err != git.NoErrAlreadyUpToDate {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	fetchRoot, _ := h.getRepoRoot(req.Path)
	fetchBS := collectBranchStatus(fetchRoot)
	c.JSON(http.StatusOK, gin.H{"ok": true, "branchStatus": fetchBS})
}

type GitPullRequest struct {
	Path   string `json:"path" binding:"required"`
	Remote string `json:"remote"`
	Branch string `json:"branch"`
}

// Pull godoc
// @Summary Pull from remote
// @Description Pull updates from a remote repository and merge
// @Tags Git
// @Accept json
// @Produce json
// @Param request body GitPullRequest true "Pull request"
// @Success 200 {object} map[string]bool
// @Failure 400 {object} map[string]string
// @Failure 500 {object} map[string]string
// @Router /api/git/pull [post]
func (h *GitHandler) Pull(c *gin.Context) {
	var req GitPullRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	repo, err := h.openRepo(req.Path)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	w, err := repo.Worktree()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	remoteName := req.Remote
	if remoteName == "" {
		remoteName = "origin"
	}

	pullOpts := &git.PullOptions{
		RemoteName: remoteName,
		Progress:   os.Stdout,
	}

	if req.Branch != "" {
		pullOpts.ReferenceName = plumbing.NewBranchReferenceName(req.Branch)
	}

	err = w.Pull(pullOpts)
	if err != nil && err != git.NoErrAlreadyUpToDate {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	repo2, _ := h.openRepo(req.Path)
	pullFiles := collectFileStatus(repo2)
	pullCommits := collectCommitLog(repo2, 20)
	pullConflicts := collectConflictFiles(repo2)
	pullRoot, _ := h.getRepoRoot(req.Path)
	pullBS := collectBranchStatus(pullRoot)
	c.JSON(http.StatusOK, gin.H{
		"ok": true, "status": gin.H{"files": pullFiles},
		"commits": pullCommits, "conflicts": pullConflicts, "branchStatus": pullBS,
	})
}

type GitPushRequest struct {
	Path   string `json:"path" binding:"required"`
	Remote string `json:"remote"`
}

// Push godoc
// @Summary Push to remote
// @Description Push local commits to a remote repository
// @Tags Git
// @Accept json
// @Produce json
// @Param request body GitPushRequest true "Push request"
// @Success 200 {object} map[string]bool
// @Failure 400 {object} map[string]string
// @Failure 500 {object} map[string]string
// @Router /api/git/push [post]
func (h *GitHandler) Push(c *gin.Context) {
	var req GitPushRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	repo, err := h.openRepo(req.Path)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	remoteName := req.Remote
	if remoteName == "" {
		remoteName = "origin"
	}

	err = repo.Push(&git.PushOptions{
		RemoteName: remoteName,
		Progress:   os.Stdout,
	})
	if err != nil && err != git.NoErrAlreadyUpToDate {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	pushRoot, _ := h.getRepoRoot(req.Path)
	pushBS := collectBranchStatus(pushRoot)
	c.JSON(http.StatusOK, gin.H{"ok": true, "branchStatus": pushBS})
}

func (h *GitHandler) getRepoRoot(path string) (string, error) {
	repo, err := h.openRepo(path)
	if err != nil {
		return "", err
	}
	w, err := repo.Worktree()
	if err != nil {
		return "", err
	}
	return w.Filesystem.Root(), nil
}

type GitStashRequest struct {
	Path    string   `json:"path" binding:"required"`
	Message string   `json:"message"`
	Files   []string `json:"files"`
}

func (h *GitHandler) Stash(c *gin.Context) {
	var req GitStashRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	repoRoot, err := h.getRepoRoot(req.Path)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	args := []string{"stash", "push", "--include-untracked"}
	if req.Message != "" {
		args = append(args, "-m", req.Message)
	}
	if len(req.Files) > 0 {
		args = append(args, "--")
		args = append(args, req.Files...)
	}

	cmd := exec.Command("git", args...)
	cmd.Dir = repoRoot
	output, err := cmd.CombinedOutput()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": string(output)})
		return
	}

	repo, errR := h.openRepo(req.Path)
	stashResult := gin.H{"ok": true, "message": strings.TrimSpace(string(output))}
	if errR == nil {
		stashResult["status"] = gin.H{"files": collectFileStatus(repo)}
	}
	c.JSON(http.StatusOK, stashResult)
}

type StashEntry struct {
	Index   int    `json:"index"`
	Message string `json:"message"`
}

// StashList godoc
// @Summary List stashes
// @Description Get list of stashed changes (uses git CLI as go-git lacks native stash support)
// @Tags Git
// @Accept json
// @Produce json
// @Param request body GitPathRequest true "Path request"
// @Success 200 {object} map[string]interface{}
// @Failure 400 {object} map[string]string
// @Failure 500 {object} map[string]string
// @Router /api/git/stash-list [post]
func (h *GitHandler) StashList(c *gin.Context) {
	var req GitPathRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	repoRoot, err := h.getRepoRoot(req.Path)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	cmd := exec.Command("git", "stash", "list")
	cmd.Dir = repoRoot
	output, err := cmd.CombinedOutput()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": string(output)})
		return
	}

	var entries []StashEntry
	lines := strings.Split(strings.TrimSpace(string(output)), "\n")
	for i, line := range lines {
		if line == "" {
			continue
		}
		entries = append(entries, StashEntry{
			Index:   i,
			Message: line,
		})
	}

	c.JSON(http.StatusOK, gin.H{"stashes": entries})
}

type GitStashIndexRequest struct {
	Path  string `json:"path" binding:"required"`
	Index int    `json:"index"`
}

// StashPop godoc
// @Summary Pop stash
// @Description Apply and remove a stash entry (uses git CLI as go-git lacks native stash support)
// @Tags Git
// @Accept json
// @Produce json
// @Param request body GitStashIndexRequest true "Stash index request"
// @Success 200 {object} map[string]bool
// @Failure 400 {object} map[string]string
// @Failure 500 {object} map[string]string
// @Router /api/git/stash-pop [post]
func (h *GitHandler) StashPop(c *gin.Context) {
	var req GitStashIndexRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	repoRoot, err := h.getRepoRoot(req.Path)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	args := []string{"stash", "pop"}
	if req.Index > 0 {
		args = append(args, fmt.Sprintf("stash@{%d}", req.Index))
	}

	cmd := exec.Command("git", args...)
	cmd.Dir = repoRoot
	output, err := cmd.CombinedOutput()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": string(output)})
		return
	}

	repo, errR := h.openRepo(req.Path)
	popResult := gin.H{"ok": true}
	if errR == nil {
		popResult["status"] = gin.H{"files": collectFileStatus(repo)}
	}
	c.JSON(http.StatusOK, popResult)
}

// StashDrop godoc
// @Summary Drop stash
// @Description Remove a stash entry without applying (uses git CLI as go-git lacks native stash support)
// @Tags Git
// @Accept json
// @Produce json
// @Param request body GitStashIndexRequest true "Stash index request"
// @Success 200 {object} map[string]bool
// @Failure 400 {object} map[string]string
// @Failure 500 {object} map[string]string
// @Router /api/git/stash-drop [post]
func (h *GitHandler) StashDrop(c *gin.Context) {
	var req GitStashIndexRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	repoRoot, err := h.getRepoRoot(req.Path)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	args := []string{"stash", "drop"}
	if req.Index > 0 {
		args = append(args, fmt.Sprintf("stash@{%d}", req.Index))
	}

	cmd := exec.Command("git", args...)
	cmd.Dir = repoRoot
	output, err := cmd.CombinedOutput()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": string(output)})
		return
	}

	c.JSON(http.StatusOK, gin.H{"ok": true})
}

// Conflicts godoc
// @Summary List conflict files
// @Description Get list of files with merge conflicts
// @Tags Git
// @Accept json
// @Produce json
// @Param request body GitPathRequest true "Path request"
// @Success 200 {object} map[string]interface{}
// @Failure 400 {object} map[string]string
// @Failure 500 {object} map[string]string
// @Router /api/git/conflicts [post]
func (h *GitHandler) Conflicts(c *gin.Context) {
	var req GitPathRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	repo, err := h.openRepo(req.Path)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	w, err := repo.Worktree()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	status, err := w.Status()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	var conflicts []string
	for path, s := range status {
		if s.Worktree == git.UpdatedButUnmerged || s.Staging == git.UpdatedButUnmerged {
			conflicts = append(conflicts, path)
		}
	}

	sort.Strings(conflicts)
	c.JSON(http.StatusOK, gin.H{"conflicts": conflicts})
}

type GitResolveConflictRequest struct {
	Path     string `json:"path" binding:"required"`
	FilePath string `json:"filePath" binding:"required"`
	Content  string `json:"content" binding:"required"`
}

// ResolveConflict godoc
// @Summary Resolve conflict
// @Description Resolve a merge conflict by writing resolved content and staging the file
// @Tags Git
// @Accept json
// @Produce json
// @Param request body GitResolveConflictRequest true "Resolve conflict request"
// @Success 200 {object} map[string]bool
// @Failure 400 {object} map[string]string
// @Failure 500 {object} map[string]string
// @Router /api/git/resolve-conflict [post]
func (h *GitHandler) ResolveConflict(c *gin.Context) {
	var req GitResolveConflictRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	repo, err := h.openRepo(req.Path)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	w, err := repo.Worktree()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	absPath := filepath.Join(w.Filesystem.Root(), req.FilePath)
	if err := os.WriteFile(absPath, []byte(req.Content), 0644); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	if _, err := w.Add(req.FilePath); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"ok": true})
}

type GitAddPatchRequest struct {
	Path     string `json:"path" binding:"required"`
	FilePath string `json:"filePath" binding:"required"`
	Patch    string `json:"patch" binding:"required"`
}

// AddPatch godoc
// @Summary Apply patch to staging
// @Description Apply a unified diff patch to the staging area (uses git CLI for git apply --cached)
// @Tags Git
// @Accept json
// @Produce json
// @Param request body GitAddPatchRequest true "Add patch request"
// @Success 200 {object} map[string]bool
// @Failure 400 {object} map[string]string
// @Failure 500 {object} map[string]string
// @Router /api/git/add-patch [post]
func (h *GitHandler) AddPatch(c *gin.Context) {
	var req GitAddPatchRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	repoRoot, err := h.getRepoRoot(req.Path)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	cmd := exec.Command("git", "apply", "--cached", "-")
	cmd.Dir = repoRoot
	cmd.Stdin = strings.NewReader(req.Patch)
	output, err := cmd.CombinedOutput()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": string(output)})
		return
	}

	c.JSON(http.StatusOK, gin.H{"ok": true})
}
