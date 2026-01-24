package handler

import (
	"io"
	"os/exec"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/go-git/go-git/v6"
	"github.com/go-git/go-git/v6/plumbing"
	"github.com/go-git/go-git/v6/plumbing/object"
)

type BranchStatusInfo struct {
	Branch   string `json:"branch"`
	Upstream string `json:"upstream"`
	Ahead    int    `json:"ahead"`
	Behind   int    `json:"behind"`
}

func collectFileStatus(repo *git.Repository) []FileStatus {
	w, err := repo.Worktree()
	if err != nil {
		return nil
	}
	status, err := w.Status()
	if err != nil {
		return nil
	}
	var files []FileStatus
	for p, s := range status {
		if s.Staging == git.Untracked && s.Worktree == git.Untracked {
			files = append(files, FileStatus{Path: p, Status: string(s.Worktree), Staged: false})
			continue
		}
		if s.Staging != git.Unmodified && s.Staging != git.Untracked {
			files = append(files, FileStatus{Path: p, Status: string(s.Staging), Staged: true})
		}
		if s.Worktree != git.Unmodified && s.Worktree != git.Untracked {
			files = append(files, FileStatus{Path: p, Status: string(s.Worktree), Staged: false})
		}
	}
	sort.Slice(files, func(i, j int) bool { return files[i].Path < files[j].Path })
	return files
}

func collectCommitLog(repo *git.Repository, limit int) []CommitInfo {
	if limit <= 0 {
		limit = 20
	}
	ref, err := repo.Head()
	if err != nil {
		return []CommitInfo{}
	}
	iter, err := repo.Log(&git.LogOptions{From: ref.Hash()})
	if err != nil {
		return []CommitInfo{}
	}
	var commits []CommitInfo
	count := 0
	_ = iter.ForEach(func(c *object.Commit) error {
		if count >= limit {
			return io.EOF
		}
		commits = append(commits, CommitInfo{
			Hash:    c.Hash.String(),
			Message: c.Message,
			Author:  c.Author.Name,
			Date:    c.Author.When.Format(time.RFC3339),
		})
		count++
		return nil
	})
	return commits
}

func collectBranchStatus(repoRoot string) *BranchStatusInfo {
	info := &BranchStatusInfo{}

	cmd := exec.Command("git", "branch", "--show-current")
	cmd.Dir = repoRoot
	out, err := cmd.Output()
	if err != nil {
		return info
	}
	info.Branch = strings.TrimSpace(string(out))
	if info.Branch == "" {
		return info
	}

	cmd = exec.Command("git", "rev-parse", "--abbrev-ref", info.Branch+"@{upstream}")
	cmd.Dir = repoRoot
	out, err = cmd.Output()
	if err != nil {
		return info
	}
	info.Upstream = strings.TrimSpace(string(out))

	cmd = exec.Command("git", "rev-list", "--left-right", "--count", info.Upstream+"...HEAD")
	cmd.Dir = repoRoot
	out, err = cmd.Output()
	if err != nil {
		return info
	}
	parts := strings.Fields(strings.TrimSpace(string(out)))
	if len(parts) >= 2 {
		info.Behind, _ = strconv.Atoi(parts[0])
		info.Ahead, _ = strconv.Atoi(parts[1])
	}
	return info
}

func collectConflictFiles(repo *git.Repository) []string {
	w, err := repo.Worktree()
	if err != nil {
		return nil
	}
	status, err := w.Status()
	if err != nil {
		return nil
	}
	var conflicts []string
	for p, s := range status {
		if s.Worktree == git.UpdatedButUnmerged || s.Staging == git.UpdatedButUnmerged {
			conflicts = append(conflicts, p)
		}
	}
	sort.Strings(conflicts)
	return conflicts
}

func collectRemoteBranches(repo *git.Repository) []string {
	refs, err := repo.References()
	if err != nil {
		return nil
	}
	var remote []string
	_ = refs.ForEach(func(ref *plumbing.Reference) error {
		name := ref.Name().String()
		if strings.HasPrefix(name, "refs/remotes/") {
			short := strings.TrimPrefix(name, "refs/remotes/")
			if !strings.HasSuffix(short, "/HEAD") {
				remote = append(remote, short)
			}
		}
		return nil
	})
	sort.Strings(remote)
	return remote
}
