package handler

import (
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/go-git/go-git/v6"
	"github.com/go-git/go-git/v6/plumbing"
)

type BranchInfo struct {
	Name      string `json:"name"`
	IsCurrent bool   `json:"isCurrent"`
}

// Branches godoc
// @Summary List branches
// @Description Get list of local branches and current branch
// @Tags Git
// @Accept json
// @Produce json
// @Param request body GitPathRequest true "Path request"
// @Success 200 {object} map[string]interface{}
// @Failure 400 {object} map[string]string
// @Failure 500 {object} map[string]string
// @Router /api/git/branches [post]
func (h *GitHandler) Branches(c *gin.Context) {
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

	head, err := repo.Head()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	currentBranch := ""
	if head.Name().IsBranch() {
		currentBranch = head.Name().Short()
	}

	branches, err := repo.Branches()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	var branchList []BranchInfo
	err = branches.ForEach(func(ref *plumbing.Reference) error {
		branchName := ref.Name().Short()
		branchList = append(branchList, BranchInfo{
			Name:      branchName,
			IsCurrent: branchName == currentBranch,
		})
		return nil
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"branches":      branchList,
		"currentBranch": currentBranch,
	})
}

type SwitchBranchRequest struct {
	Path   string `json:"path" binding:"required"`
	Branch string `json:"branch" binding:"required"`
}

// SwitchBranch godoc
// @Summary Switch branch
// @Description Checkout to a different branch
// @Tags Git
// @Accept json
// @Produce json
// @Param request body SwitchBranchRequest true "Switch branch request"
// @Success 200 {object} map[string]interface{}
// @Failure 400 {object} map[string]string
// @Failure 500 {object} map[string]string
// @Router /api/git/switch-branch [post]
func (h *GitHandler) SwitchBranch(c *gin.Context) {
	var req SwitchBranchRequest
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

	branchRefName := plumbing.NewBranchReferenceName(req.Branch)
	
	ref, err := repo.Reference(branchRefName, true)
	if err != nil {
		if err == plumbing.ErrReferenceNotFound {
			c.JSON(http.StatusBadRequest, gin.H{"error": "branch not found: " + req.Branch})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	err = w.Checkout(&git.CheckoutOptions{
		Branch: ref.Name(),
	})
	if err != nil {
		if strings.Contains(err.Error(), "worktree contains unstaged changes") {
			c.JSON(http.StatusBadRequest, gin.H{"error": "cannot switch branch: you have unstaged changes"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"ok": true, "branch": req.Branch})
}

type CreateBranchRequest struct {
	Path   string `json:"path" binding:"required"`
	Branch string `json:"branch" binding:"required"`
	From   string `json:"from"`
}

// CreateBranch godoc
// @Summary Create branch
// @Description Create a new branch from HEAD or specified source
// @Tags Git
// @Accept json
// @Produce json
// @Param request body CreateBranchRequest true "Create branch request"
// @Success 200 {object} map[string]interface{}
// @Failure 400 {object} map[string]string
// @Failure 500 {object} map[string]string
// @Router /api/git/create-branch [post]
func (h *GitHandler) CreateBranch(c *gin.Context) {
	var req CreateBranchRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	repo, err := h.openRepo(req.Path)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	var hash plumbing.Hash
	if req.From != "" {
		ref, err := repo.Reference(plumbing.NewBranchReferenceName(req.From), true)
		if err != nil {
			resolvedHash, err := repo.ResolveRevision(plumbing.Revision(req.From))
			if err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"error": "invalid source: " + req.From})
				return
			}
			hash = *resolvedHash
		} else {
			hash = ref.Hash()
		}
	} else {
		head, err := repo.Head()
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		hash = head.Hash()
	}

	branchRefName := plumbing.NewBranchReferenceName(req.Branch)
	ref := plumbing.NewHashReference(branchRefName, hash)

	if err := repo.Storer.SetReference(ref); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"ok": true, "branch": req.Branch})
}

type DeleteBranchRequest struct {
	Path   string `json:"path" binding:"required"`
	Branch string `json:"branch" binding:"required"`
}

// DeleteBranch godoc
// @Summary Delete branch
// @Description Delete a local branch (cannot delete current branch)
// @Tags Git
// @Accept json
// @Produce json
// @Param request body DeleteBranchRequest true "Delete branch request"
// @Success 200 {object} map[string]bool
// @Failure 400 {object} map[string]string
// @Failure 500 {object} map[string]string
// @Router /api/git/delete-branch [post]
func (h *GitHandler) DeleteBranch(c *gin.Context) {
	var req DeleteBranchRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	repo, err := h.openRepo(req.Path)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	head, err := repo.Head()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	if head.Name().Short() == req.Branch {
		c.JSON(http.StatusBadRequest, gin.H{"error": "cannot delete current branch"})
		return
	}

	branchRefName := plumbing.NewBranchReferenceName(req.Branch)
	if err := repo.Storer.RemoveReference(branchRefName); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"ok": true})
}
