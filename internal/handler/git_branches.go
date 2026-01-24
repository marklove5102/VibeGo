package handler

import (
	"net/http"
	"os/exec"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/go-git/go-git/v6"
	"github.com/go-git/go-git/v6/plumbing"
)

type BranchInfo struct {
	Name      string `json:"name"`
	IsCurrent bool   `json:"isCurrent"`
}

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

	remoteBranches := collectRemoteBranches(repo)

	c.JSON(http.StatusOK, gin.H{
		"branches":       branchList,
		"remoteBranches": remoteBranches,
		"currentBranch":  currentBranch,
	})
}

type SwitchBranchRequest struct {
	Path   string `json:"path" binding:"required"`
	Branch string `json:"branch" binding:"required"`
}

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

func (h *GitHandler) SmartSwitchBranch(c *gin.Context) {
	var req SwitchBranchRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	repoRoot, err := h.getRepoRoot(req.Path)
	if err != nil {
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

	hasChanges := !status.IsClean()
	stashed := false
	stashConflict := false

	if hasChanges {
		cmd := exec.Command("git", "stash", "push", "-m", "auto-stash: switching to "+req.Branch)
		cmd.Dir = repoRoot
		output, err := cmd.CombinedOutput()
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "stash failed: " + string(output)})
			return
		}
		stashed = true
	}

	branchRefName := plumbing.NewBranchReferenceName(req.Branch)
	ref, err := repo.Reference(branchRefName, true)
	if err != nil {
		if stashed {
			cmd := exec.Command("git", "stash", "pop")
			cmd.Dir = repoRoot
			cmd.CombinedOutput()
		}
		c.JSON(http.StatusBadRequest, gin.H{"error": "branch not found: " + req.Branch})
		return
	}

	repo, _ = h.openRepo(req.Path)
	w, _ = repo.Worktree()
	err = w.Checkout(&git.CheckoutOptions{Branch: ref.Name()})
	if err != nil {
		if stashed {
			cmd := exec.Command("git", "stash", "pop")
			cmd.Dir = repoRoot
			cmd.CombinedOutput()
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	if stashed {
		cmd := exec.Command("git", "stash", "pop")
		cmd.Dir = repoRoot
		output, err := cmd.CombinedOutput()
		if err != nil {
			stashConflict = strings.Contains(string(output), "CONFLICT")
		}
	}

	repo, _ = h.openRepo(req.Path)
	files := collectFileStatus(repo)
	bs := collectBranchStatus(repoRoot)

	c.JSON(http.StatusOK, gin.H{
		"ok": true, "branch": req.Branch,
		"stashed": stashed, "stashConflict": stashConflict,
		"status": gin.H{"files": files}, "branchStatus": bs,
	})
}

func (h *GitHandler) BranchStatus(c *gin.Context) {
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

	bs := collectBranchStatus(repoRoot)
	c.JSON(http.StatusOK, bs)
}

type CreateBranchRequest struct {
	Path   string `json:"path" binding:"required"`
	Branch string `json:"branch" binding:"required"`
	From   string `json:"from"`
}

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
