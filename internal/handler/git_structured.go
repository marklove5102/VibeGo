package handler

import (
	"crypto/sha256"
	"fmt"
	"net/http"
	"os/exec"
	"path/filepath"
	"sort"
	"strings"

	"github.com/gin-gonic/gin"
)

type StructuredFile struct {
	Path          string `json:"path"`
	Name          string `json:"name"`
	IndexStatus   string `json:"indexStatus"`
	WorktreeStatus string `json:"worktreeStatus"`
	ChangeType    string `json:"changeType"`
	IncludedState string `json:"includedState"`
	Conflicted    bool   `json:"conflicted"`
}

type StatusSummary struct {
	Changed    int `json:"changed"`
	Staged     int `json:"staged"`
	Unstaged   int `json:"unstaged"`
	Included   int `json:"included"`
	Conflicted int `json:"conflicted"`
}

func porcelainStatusToName(code byte) string {
	switch code {
	case 'M':
		return "modified"
	case 'A':
		return "added"
	case 'D':
		return "deleted"
	case 'R':
		return "renamed"
	case 'C':
		return "copied"
	case '?':
		return "untracked"
	case 'U':
		return "unmerged"
	case '.', ' ':
		return "clean"
	default:
		return "unknown"
	}
}

func collectStructuredStatus(repoRoot string) ([]StructuredFile, StatusSummary) {
	cmd := exec.Command("git", "status", "--porcelain=v1", "-z")
	cmd.Dir = repoRoot
	output, err := cmd.Output()
	if err != nil {
		return []StructuredFile{}, StatusSummary{}
	}

	var files []StructuredFile
	summary := StatusSummary{}
	seen := map[string]bool{}
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
		if path == "" || seen[path] {
			continue
		}
		seen[path] = true

		name := path
		if idx := strings.LastIndex(path, "/"); idx >= 0 {
			name = path[idx+1:]
		}

		indexStatus := porcelainStatusToName(x)
		worktreeStatus := porcelainStatusToName(y)

		if x == '?' && y == '?' {
			indexStatus = "untracked"
			worktreeStatus = "untracked"
		}

		changeType := "modified"
		if x == '?' || y == '?' {
			changeType = "untracked"
		} else if x == 'A' || y == 'A' {
			changeType = "added"
		} else if x == 'D' || y == 'D' {
			changeType = "deleted"
		} else if x == 'R' || y == 'R' {
			changeType = "renamed"
		} else if x == 'C' || y == 'C' {
			changeType = "copied"
		} else if x == 'U' || y == 'U' {
			changeType = "unmerged"
		}

		conflicted := x == 'U' || y == 'U' || (x == 'A' && y == 'A') || (x == 'D' && y == 'D')

		files = append(files, StructuredFile{
			Path:          path,
			Name:          name,
			IndexStatus:   indexStatus,
			WorktreeStatus: worktreeStatus,
			ChangeType:    changeType,
			IncludedState: "all",
			Conflicted:    conflicted,
		})

		summary.Changed++
		if indexStatus != "clean" && indexStatus != "untracked" {
			summary.Staged++
		}
		if worktreeStatus != "clean" {
			summary.Unstaged++
		}
		if conflicted {
			summary.Conflicted++
		}
		summary.Included++
	}

	sort.Slice(files, func(i, j int) bool { return files[i].Path < files[j].Path })
	return files, summary
}

type DiffLine struct {
	ID         string `json:"id"`
	Kind       string `json:"kind"`
	Content    string `json:"content"`
	OldLine    int    `json:"oldLine"`
	NewLine    int    `json:"newLine"`
	Selectable bool   `json:"selectable"`
}

type DiffHunk struct {
	ID       string     `json:"id"`
	Header   string     `json:"header"`
	OldStart int        `json:"oldStart"`
	OldLines int        `json:"oldLines"`
	NewStart int        `json:"newStart"`
	NewLines int        `json:"newLines"`
	Lines    []DiffLine `json:"lines"`
	Patch    string     `json:"patch"`
}

type DiffStats struct {
	Added   int `json:"added"`
	Deleted int `json:"deleted"`
	Hunks   int `json:"hunks"`
	Lines   int `json:"lines"`
}

type DiffCapability struct {
	LineSelectable bool `json:"lineSelectable"`
}

type InteractiveDiff struct {
	Path       string         `json:"path"`
	Mode       string         `json:"mode"`
	Patch      string         `json:"patch"`
	PatchHash  string         `json:"patchHash"`
	Hunks      []DiffHunk     `json:"hunks"`
	Stats      DiffStats      `json:"stats"`
	Capability DiffCapability `json:"capability"`
	Old        string         `json:"old"`
	New        string         `json:"new"`
	Binary     bool           `json:"binary"`
}

func computePatchHash(patch string) string {
	h := sha256.Sum256([]byte(patch))
	return fmt.Sprintf("%x", h[:8])
}

func parseUnifiedDiff(patch string) []DiffHunk {
	lines := strings.Split(patch, "\n")
	var hunks []DiffHunk
	var current *DiffHunk
	hunkIdx := 0
	oldLine, newLine := 0, 0

	for _, line := range lines {
		if strings.HasPrefix(line, "@@") {
			hunkIdx++
			hunk := DiffHunk{
				ID:     fmt.Sprintf("hunk-%d", hunkIdx),
				Header: line,
			}
			var oStart, oLines, nStart, nLines int
			fmt.Sscanf(line, "@@ -%d,%d +%d,%d", &oStart, &oLines, &nStart, &nLines)
			if oLines == 0 && oStart > 0 {
				oLines = 1
			}
			if nLines == 0 && nStart > 0 {
				nLines = 1
			}
			hunk.OldStart = oStart
			hunk.OldLines = oLines
			hunk.NewStart = nStart
			hunk.NewLines = nLines
			oldLine = oStart
			newLine = nStart
			hunks = append(hunks, hunk)
			current = &hunks[len(hunks)-1]
			continue
		}

		if current == nil {
			continue
		}

		lineIdx := len(current.Lines) + 1
		if strings.HasPrefix(line, "+") {
			current.Lines = append(current.Lines, DiffLine{
				ID:         fmt.Sprintf("%s-line-%d", current.ID, lineIdx),
				Kind:       "add",
				Content:    line[1:],
				OldLine:    0,
				NewLine:    newLine,
				Selectable: true,
			})
			newLine++
		} else if strings.HasPrefix(line, "-") {
			current.Lines = append(current.Lines, DiffLine{
				ID:         fmt.Sprintf("%s-line-%d", current.ID, lineIdx),
				Kind:       "del",
				Content:    line[1:],
				OldLine:    oldLine,
				NewLine:    0,
				Selectable: true,
			})
			oldLine++
		} else if strings.HasPrefix(line, " ") || line == "" {
			content := ""
			if len(line) > 0 {
				content = line[1:]
			}
			current.Lines = append(current.Lines, DiffLine{
				ID:         fmt.Sprintf("%s-line-%d", current.ID, lineIdx),
				Kind:       "context",
				Content:    content,
				OldLine:    oldLine,
				NewLine:    newLine,
				Selectable: false,
			})
			oldLine++
			newLine++
		}
	}

	for i := range hunks {
		var patchLines []string
		patchLines = append(patchLines, hunks[i].Header)
		for _, l := range hunks[i].Lines {
			prefix := " "
			if l.Kind == "add" {
				prefix = "+"
			} else if l.Kind == "del" {
				prefix = "-"
			}
			patchLines = append(patchLines, prefix+l.Content)
		}
		hunks[i].Patch = strings.Join(patchLines, "\n")
	}

	return hunks
}

func getGitDiff(repoRoot, filePath, mode string) (*InteractiveDiff, error) {
	var args []string
	switch mode {
	case "staged":
		args = []string{"diff", "--cached", "--", filePath}
	default:
		args = []string{"diff", "--", filePath}
	}

	cmd := exec.Command("git", args...)
	cmd.Dir = repoRoot
	output, err := cmd.Output()
	if err != nil {
		return &InteractiveDiff{
			Path:       filePath,
			Mode:       mode,
			Hunks:      []DiffHunk{},
			Stats:      DiffStats{},
			Capability: DiffCapability{LineSelectable: true},
		}, nil
	}

	patch := string(output)
	hunks := parseUnifiedDiff(patch)

	stats := DiffStats{Hunks: len(hunks)}
	for _, h := range hunks {
		for _, l := range h.Lines {
			stats.Lines++
			if l.Kind == "add" {
				stats.Added++
			} else if l.Kind == "del" {
				stats.Deleted++
			}
		}
	}

	oldCmd := exec.Command("git", "show", "HEAD:"+filePath)
	oldCmd.Dir = repoRoot
	oldOutput, _ := oldCmd.Output()

	newCmd := exec.Command("git", "show", ":"+filePath)
	newCmd.Dir = repoRoot
	newOutput, _ := newCmd.Output()
	if mode == "working" {
		absPath := filepath.Join(repoRoot, filePath)
		fileCmd := exec.Command("cat", absPath)
		if out, err := fileCmd.Output(); err == nil {
			newOutput = out
		}
	}

	return &InteractiveDiff{
		Path:       filePath,
		Mode:       mode,
		Patch:      patch,
		PatchHash:  computePatchHash(patch),
		Hunks:      hunks,
		Stats:      stats,
		Capability: DiffCapability{LineSelectable: true},
		Old:        string(oldOutput),
		New:        string(newOutput),
	}, nil
}

type FileDiffRequest struct {
	Path     string `json:"path" binding:"required"`
	FilePath string `json:"filePath" binding:"required"`
	Mode     string `json:"mode"`
}

func (h *GitHandler) FileDiff(c *gin.Context) {
	var req FileDiffRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if req.Mode == "" {
		req.Mode = "working"
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

	diff, err := getGitDiff(w.Filesystem.Root(), req.FilePath, req.Mode)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, diff)
}

type ApplySelectionRequest struct {
	Path      string   `json:"path" binding:"required"`
	FilePath  string   `json:"filePath" binding:"required"`
	Mode      string   `json:"mode" binding:"required"`
	Target    string   `json:"target" binding:"required"`
	Action    string   `json:"action" binding:"required"`
	PatchHash string   `json:"patchHash"`
	LineIds   []string `json:"lineIds"`
	HunkIds   []string `json:"hunkIds"`
}

func (h *GitHandler) ApplySelection(c *gin.Context) {
	var req ApplySelectionRequest
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
	repoRoot := w.Filesystem.Root()

	switch req.Action {
	case "include":
		cmd := exec.Command("git", "add", "--", req.FilePath)
		cmd.Dir = repoRoot
		if out, err := cmd.CombinedOutput(); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": gitCommandError(err, out).Error()})
			return
		}
	case "exclude":
		cmd := exec.Command("git", "reset", "HEAD", "--", req.FilePath)
		cmd.Dir = repoRoot
		if out, err := cmd.CombinedOutput(); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": gitCommandError(err, out).Error()})
			return
		}
	case "discard":
		cmd := exec.Command("git", "checkout", "--", req.FilePath)
		cmd.Dir = repoRoot
		if out, err := cmd.CombinedOutput(); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": gitCommandError(err, out).Error()})
			return
		}
	default:
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid action"})
		return
	}

	files, summary := collectStructuredStatus(repoRoot)
	diff, _ := getGitDiff(repoRoot, req.FilePath, req.Mode)

	result := gin.H{"ok": true, "status": gin.H{"files": files, "summary": summary}}
	if diff != nil && len(diff.Hunks) > 0 {
		result["diff"] = diff
	}
	c.JSON(http.StatusOK, result)
}

type StashFilesRequest struct {
	Path  string `json:"path" binding:"required"`
	Index int    `json:"index"`
}

type StashFileInfo struct {
	Path   string `json:"path"`
	Status string `json:"status"`
}

func (h *GitHandler) StashFiles(c *gin.Context) {
	var req StashFilesRequest
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
	repoRoot := w.Filesystem.Root()

	cmd := exec.Command("git", "stash", "show", "--name-status", fmt.Sprintf("stash@{%d}", req.Index))
	cmd.Dir = repoRoot
	output, err := cmd.Output()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to get stash files"})
		return
	}

	var files []StashFileInfo
	for _, line := range strings.Split(strings.TrimSpace(string(output)), "\n") {
		if line == "" {
			continue
		}
		parts := strings.SplitN(line, "\t", 2)
		if len(parts) < 2 {
			continue
		}
		status := "modified"
		switch parts[0] {
		case "A":
			status = "added"
		case "D":
			status = "deleted"
		case "R":
			status = "renamed"
		case "C":
			status = "copied"
		}
		files = append(files, StashFileInfo{Path: parts[1], Status: status})
	}

	c.JSON(http.StatusOK, gin.H{"files": files})
}

type StashDiffRequest struct {
	Path     string `json:"path" binding:"required"`
	Index    int    `json:"index"`
	FilePath string `json:"filePath" binding:"required"`
}

func (h *GitHandler) StashDiff(c *gin.Context) {
	var req StashDiffRequest
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
	repoRoot := w.Filesystem.Root()

	stashRef := fmt.Sprintf("stash@{%d}", req.Index)

	cmd := exec.Command("git", "diff", stashRef+"^.."+stashRef, "--", req.FilePath)
	cmd.Dir = repoRoot
	output, err := cmd.Output()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to get stash diff"})
		return
	}

	patch := string(output)
	hunks := parseUnifiedDiff(patch)

	stats := DiffStats{Hunks: len(hunks)}
	for _, h := range hunks {
		for _, l := range h.Lines {
			stats.Lines++
			if l.Kind == "add" {
				stats.Added++
			} else if l.Kind == "del" {
				stats.Deleted++
			}
		}
	}

	parentCmd := exec.Command("git", "show", stashRef+"^:"+req.FilePath)
	parentCmd.Dir = repoRoot
	oldContent, _ := parentCmd.Output()

	stashCmd := exec.Command("git", "show", stashRef+":"+req.FilePath)
	stashCmd.Dir = repoRoot
	newContent, _ := stashCmd.Output()

	c.JSON(http.StatusOK, InteractiveDiff{
		Path:       req.FilePath,
		Mode:       "stash",
		Patch:      patch,
		PatchHash:  computePatchHash(patch),
		Hunks:      hunks,
		Stats:      stats,
		Capability: DiffCapability{LineSelectable: false},
		Old:        string(oldContent),
		New:        string(newContent),
	})
}

type ConflictSegment struct {
	Type    string   `json:"type"`
	Text    string   `json:"text,omitempty"`
	BlockID string   `json:"blockId,omitempty"`
	Ours    []string `json:"ours,omitempty"`
	Base    []string `json:"base,omitempty"`
	Theirs  []string `json:"theirs,omitempty"`
}

type ConflictDetailsResponse struct {
	Path        string            `json:"path"`
	Hash        string            `json:"hash"`
	Segments    []ConflictSegment `json:"segments"`
	BlocksTotal int               `json:"blocksTotal"`
}

func (h *GitHandler) ConflictDetails(c *gin.Context) {
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

	w, err := repo.Worktree()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	repoRoot := w.Filesystem.Root()
	absPath := filepath.Join(repoRoot, req.FilePath)

	contentBytes, err := exec.Command("cat", absPath).Output()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "cannot read file"})
		return
	}
	content := string(contentBytes)

	segments, blocks := parseConflictMarkers(content)
	hash := computePatchHash(content)

	c.JSON(http.StatusOK, ConflictDetailsResponse{
		Path:        req.FilePath,
		Hash:        hash,
		Segments:    segments,
		BlocksTotal: blocks,
	})
}

func parseConflictMarkers(content string) ([]ConflictSegment, int) {
	lines := strings.Split(content, "\n")
	var segments []ConflictSegment
	var plainLines []string
	blockCount := 0

	type conflictState int
	const (
		stateNone conflictState = iota
		stateOurs
		stateBase
		stateTheirs
	)

	state := stateNone
	var ours, base, theirs []string

	flushPlain := func() {
		if len(plainLines) > 0 {
			segments = append(segments, ConflictSegment{
				Type: "plain",
				Text: strings.Join(plainLines, "\n"),
			})
			plainLines = nil
		}
	}

	for _, line := range lines {
		switch {
		case strings.HasPrefix(line, "<<<<<<<"):
			flushPlain()
			state = stateOurs
			ours = nil
			base = nil
			theirs = nil
		case strings.HasPrefix(line, "|||||||") && state == stateOurs:
			state = stateBase
		case line == "=======" && (state == stateOurs || state == stateBase):
			state = stateTheirs
		case strings.HasPrefix(line, ">>>>>>>") && state == stateTheirs:
			blockCount++
			segments = append(segments, ConflictSegment{
				Type:    "conflict",
				BlockID: fmt.Sprintf("block-%d", blockCount),
				Ours:    ours,
				Base:    base,
				Theirs:  theirs,
			})
			state = stateNone
		default:
			switch state {
			case stateNone:
				plainLines = append(plainLines, line)
			case stateOurs:
				ours = append(ours, line)
			case stateBase:
				base = append(base, line)
			case stateTheirs:
				theirs = append(theirs, line)
			}
		}
	}

	flushPlain()
	return segments, blockCount
}

type ConflictResolveRequest struct {
	Path            string `json:"path" binding:"required"`
	FilePath        string `json:"filePath" binding:"required"`
	Mode            string `json:"mode" binding:"required"`
	Hash            string `json:"hash"`
	ResolvedContent string `json:"resolvedContent"`
	ManualContent   string `json:"manualContent"`
}

func (h *GitHandler) ConflictResolve(c *gin.Context) {
	var req ConflictResolveRequest
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
	repoRoot := w.Filesystem.Root()
	absPath := filepath.Join(repoRoot, req.FilePath)

	var resolvedContent string
	switch req.Mode {
	case "ours":
		cmd := exec.Command("git", "show", ":2:"+req.FilePath)
		cmd.Dir = repoRoot
		out, err := cmd.Output()
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to get ours version"})
			return
		}
		resolvedContent = string(out)
	case "theirs":
		cmd := exec.Command("git", "show", ":3:"+req.FilePath)
		cmd.Dir = repoRoot
		out, err := cmd.Output()
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to get theirs version"})
			return
		}
		resolvedContent = string(out)
	case "manual", "line-map":
		if req.ManualContent != "" {
			resolvedContent = req.ManualContent
		} else if req.ResolvedContent != "" {
			resolvedContent = req.ResolvedContent
		} else {
			c.JSON(http.StatusBadRequest, gin.H{"error": "manual content required"})
			return
		}
	default:
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid mode"})
		return
	}

	writeCmd := exec.Command("tee", absPath)
	writeCmd.Stdin = strings.NewReader(resolvedContent)
	if out, err := writeCmd.CombinedOutput(); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": gitCommandError(err, out).Error()})
		return
	}

	addCmd := exec.Command("git", "add", "--", req.FilePath)
	addCmd.Dir = repoRoot
	if out, err := addCmd.CombinedOutput(); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": gitCommandError(err, out).Error()})
		return
	}

	repo2, _ := h.openRepo(req.Path)
	conflicts := collectConflictFiles(repo2)
	files, summary := collectStructuredStatus(repoRoot)

	c.JSON(http.StatusOK, gin.H{
		"ok":        true,
		"conflicts": conflicts,
		"status":    gin.H{"files": files, "summary": summary},
	})
}
