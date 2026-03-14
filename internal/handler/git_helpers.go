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

type BranchesSnapshot struct {
	Branches       []string `json:"branches"`
	RemoteBranches []string `json:"remoteBranches"`
	CurrentBranch  string   `json:"currentBranch"`
}

func collectFileStatus(repo *git.Repository) []FileStatus {
	w, err := repo.Worktree()
	if err != nil {
		return []FileStatus{}
	}
	repoRoot := w.Filesystem.Root()
	cmd := exec.Command("git", "status", "--porcelain=v1", "-z")
	cmd.Dir = repoRoot
	output, err := cmd.Output()
	if err != nil {
		return []FileStatus{}
	}
	files := []FileStatus{}
	entries := strings.Split(string(output), "\x00")
	for i := 0; i < len(entries); i++ {
		line := entries[i]
		if line == "" || len(line) < 3 {
			continue
		}
		x := line[0]
		y := line[1]
		if x == '!' && y == '!' {
			continue
		}
		path := line[3:]
		if (x == 'R' || x == 'C') && i+1 < len(entries) {
			path = entries[i+1]
			i++
		}
		if path == "" {
			continue
		}
		if x == '?' && y == '?' {
			files = append(files, FileStatus{Path: path, Status: "?", Staged: false})
			continue
		}
		if x != ' ' && x != '?' {
			files = append(files, FileStatus{Path: path, Status: string(x), Staged: true})
		}
		if y != ' ' && y != '?' {
			files = append(files, FileStatus{Path: path, Status: string(y), Staged: false})
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
			Hash:        c.Hash.String(),
			Message:     c.Message,
			Author:      c.Author.Name,
			AuthorEmail: c.Author.Email,
			Date:        c.Author.When.Format(time.RFC3339),
			ParentCount: c.NumParents(),
		})
		count++
		return nil
	})
	return commits
}

func collectHeadHash(repo *git.Repository) string {
	ref, err := repo.Head()
	if err != nil {
		return ""
	}
	return ref.Hash().String()
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

func collectBranchesSnapshot(repo *git.Repository) BranchesSnapshot {
	head, err := repo.Head()
	if err != nil {
		return BranchesSnapshot{}
	}

	currentBranch := ""
	if head.Name().IsBranch() {
		currentBranch = head.Name().Short()
	}

	branches, err := repo.Branches()
	if err != nil {
		return BranchesSnapshot{CurrentBranch: currentBranch}
	}

	var branchList []string
	_ = branches.ForEach(func(ref *plumbing.Reference) error {
		branchList = append(branchList, ref.Name().Short())
		return nil
	})
	sort.Strings(branchList)

	return BranchesSnapshot{
		Branches:       branchList,
		RemoteBranches: collectRemoteBranches(repo),
		CurrentBranch:  currentBranch,
	}
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

func collectRemoteInfos(repo *git.Repository) []RemoteInfo {
	remotes, err := repo.Remotes()
	if err != nil {
		return nil
	}

	result := make([]RemoteInfo, 0, len(remotes))
	for _, remote := range remotes {
		cfg := remote.Config()
		urls := append([]string(nil), cfg.URLs...)
		sort.Strings(urls)
		result = append(result, RemoteInfo{
			Name: cfg.Name,
			URLs: urls,
		})
	}

	sort.Slice(result, func(i, j int) bool {
		return result[i].Name < result[j].Name
	})

	return result
}

func collectStashEntries(repoRoot string) []StashEntry {
	cmd := exec.Command("git", "stash", "list")
	cmd.Dir = repoRoot
	output, err := cmd.Output()
	if err != nil {
		return nil
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

	return entries
}
