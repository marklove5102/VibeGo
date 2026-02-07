package handler

import (
	"crypto/sha1"
	"encoding/hex"
	"fmt"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"sort"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"
)

type GitStructuredFile struct {
	Path           string `json:"path"`
	Name           string `json:"name"`
	IndexStatus    string `json:"indexStatus"`
	WorktreeStatus string `json:"worktreeStatus"`
	ChangeType     string `json:"changeType"`
	IncludedState  string `json:"includedState"`
	Conflicted     bool   `json:"conflicted"`
}

type GitStatusSummary struct {
	Changed    int `json:"changed"`
	Staged     int `json:"staged"`
	Unstaged   int `json:"unstaged"`
	Included   int `json:"included"`
	Conflicted int `json:"conflicted"`
}

type GitStructuredStatus struct {
	Files   []GitStructuredFile `json:"files"`
	Summary GitStatusSummary    `json:"summary"`
}

type porcelainEntry struct {
	Path           string
	IndexStatus    string
	WorktreeStatus string
	Conflicted     bool
}

func parseStatusCode(ch byte) string {
	switch ch {
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
	case 'U':
		return "unmerged"
	case '?':
		return "untracked"
	default:
		return "clean"
	}
}

func isConflictCode(x, y byte) bool {
	if x == 'U' || y == 'U' {
		return true
	}
	if x == 'A' && y == 'A' {
		return true
	}
	if x == 'D' && y == 'D' {
		return true
	}
	if x == 'A' && y == 'U' {
		return true
	}
	if x == 'U' && y == 'D' {
		return true
	}
	if x == 'D' && y == 'U' {
		return true
	}
	if x == 'U' && y == 'A' {
		return true
	}
	return false
}

func parsePorcelainV1(repoRoot string) ([]porcelainEntry, error) {
	cmd := exec.Command("git", "status", "--porcelain=v1", "-z")
	cmd.Dir = repoRoot
	out, err := cmd.Output()
	if err != nil {
		return nil, err
	}
	entries := strings.Split(string(out), "\x00")
	result := make([]porcelainEntry, 0, len(entries))
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
		entry := porcelainEntry{
			Path:           path,
			IndexStatus:    parseStatusCode(x),
			WorktreeStatus: parseStatusCode(y),
			Conflicted:     isConflictCode(x, y),
		}
		if x == '?' && y == '?' {
			entry.IndexStatus = "untracked"
			entry.WorktreeStatus = "untracked"
		}
		result = append(result, entry)
	}
	return result, nil
}

func buildStructuredStatus(repoRoot string) (*GitStructuredStatus, error) {
	entries, err := parsePorcelainV1(repoRoot)
	if err != nil {
		return nil, err
	}
	files := make([]GitStructuredFile, 0, len(entries))
	summary := GitStatusSummary{}
	for _, e := range entries {
		includedState := "none"
		if e.IndexStatus != "clean" && e.IndexStatus != "untracked" {
			if e.WorktreeStatus == "clean" {
				includedState = "all"
			} else {
				includedState = "partial"
			}
		}
		if e.IndexStatus == "untracked" || e.WorktreeStatus == "untracked" {
			includedState = "none"
		}
		changeType := e.WorktreeStatus
		if changeType == "clean" || changeType == "unmerged" {
			changeType = e.IndexStatus
		}
		if changeType == "clean" {
			changeType = "modified"
		}
		f := GitStructuredFile{
			Path:           e.Path,
			Name:           filepath.Base(e.Path),
			IndexStatus:    e.IndexStatus,
			WorktreeStatus: e.WorktreeStatus,
			ChangeType:     changeType,
			IncludedState:  includedState,
			Conflicted:     e.Conflicted,
		}
		files = append(files, f)
		summary.Changed++
		if e.IndexStatus != "clean" && e.IndexStatus != "untracked" {
			summary.Staged++
		}
		if e.WorktreeStatus != "clean" && e.WorktreeStatus != "untracked" {
			summary.Unstaged++
		}
		if includedState == "all" || includedState == "partial" {
			summary.Included++
		}
		if e.Conflicted {
			summary.Conflicted++
		}
	}
	sort.Slice(files, func(i, j int) bool { return files[i].Path < files[j].Path })
	return &GitStructuredStatus{Files: files, Summary: summary}, nil
}

func (h *GitHandler) StatusV2(c *gin.Context) {
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
	structured, err := buildStructuredStatus(repoRoot)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, structured)
}

type GitDiffLine struct {
	Kind    string `json:"kind"`
	Content string `json:"content"`
	OldLine int    `json:"oldLine"`
	NewLine int    `json:"newLine"`
}

type GitDiffHunk struct {
	ID       string        `json:"id"`
	Header   string        `json:"header"`
	OldStart int           `json:"oldStart"`
	OldLines int           `json:"oldLines"`
	NewStart int           `json:"newStart"`
	NewLines int           `json:"newLines"`
	Lines    []GitDiffLine `json:"lines"`
	Patch    string        `json:"patch"`
}

type GitInteractiveDiff struct {
	Path      string        `json:"path"`
	Mode      string        `json:"mode"`
	Patch     string        `json:"patch"`
	PatchHash string        `json:"patchHash"`
	Hunks     []GitDiffHunk `json:"hunks"`
	Old       string        `json:"old"`
	New       string        `json:"new"`
	Binary    bool          `json:"binary"`
}

type GitDiffLineV2 struct {
	ID         string `json:"id"`
	Kind       string `json:"kind"`
	Content    string `json:"content"`
	OldLine    int    `json:"oldLine"`
	NewLine    int    `json:"newLine"`
	Selectable bool   `json:"selectable"`
}

type GitDiffHunkV2 struct {
	ID       string          `json:"id"`
	Header   string          `json:"header"`
	OldStart int             `json:"oldStart"`
	OldLines int             `json:"oldLines"`
	NewStart int             `json:"newStart"`
	NewLines int             `json:"newLines"`
	Lines    []GitDiffLineV2 `json:"lines"`
	Patch    string          `json:"patch"`
}

type GitDiffStatsV2 struct {
	Added   int `json:"added"`
	Deleted int `json:"deleted"`
	Hunks   int `json:"hunks"`
	Lines   int `json:"lines"`
}

type GitDiffCapabilityV2 struct {
	LineSelectable bool `json:"lineSelectable"`
}

type GitInteractiveDiffV2 struct {
	Path       string              `json:"path"`
	Mode       string              `json:"mode"`
	Patch      string              `json:"patch"`
	PatchHash  string              `json:"patchHash"`
	Hunks      []GitDiffHunkV2     `json:"hunks"`
	Stats      GitDiffStatsV2      `json:"stats"`
	Capability GitDiffCapabilityV2 `json:"capability"`
	Old        string              `json:"old"`
	New        string              `json:"new"`
	Binary     bool                `json:"binary"`
}

var hunkHeaderRe = regexp.MustCompile(`^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@`)

func parseIntDefault(raw string, fallback int) int {
	if raw == "" {
		return fallback
	}
	v, err := strconv.Atoi(raw)
	if err != nil {
		return fallback
	}
	return v
}

func parseUnifiedHunks(patch string) []GitDiffHunk {
	lines := strings.Split(patch, "\n")
	hunks := make([]GitDiffHunk, 0)
	idx := 0
	hunkCounter := 0
	for idx < len(lines) {
		line := lines[idx]
		if !strings.HasPrefix(line, "@@ ") {
			idx++
			continue
		}
		m := hunkHeaderRe.FindStringSubmatch(line)
		if len(m) == 0 {
			idx++
			continue
		}
		oldStart := parseIntDefault(m[1], 0)
		oldLines := parseIntDefault(m[2], 1)
		newStart := parseIntDefault(m[3], 0)
		newLines := parseIntDefault(m[4], 1)
		oldCur := oldStart
		newCur := newStart
		hunkLines := make([]GitDiffLine, 0)
		raw := []string{line}
		idx++
		for idx < len(lines) {
			l := lines[idx]
			if strings.HasPrefix(l, "@@ ") {
				break
			}
			if idx == len(lines)-1 && l == "" {
				idx++
				break
			}
			if strings.HasPrefix(l, "\\ No newline at end of file") {
				raw = append(raw, l)
				idx++
				continue
			}
			kind := "context"
			oldLine := 0
			newLine := 0
			if strings.HasPrefix(l, "+") {
				kind = "add"
				newLine = newCur
				newCur++
			} else if strings.HasPrefix(l, "-") {
				kind = "del"
				oldLine = oldCur
				oldCur++
			} else {
				oldLine = oldCur
				newLine = newCur
				oldCur++
				newCur++
			}
			hunkLines = append(hunkLines, GitDiffLine{Kind: kind, Content: l, OldLine: oldLine, NewLine: newLine})
			raw = append(raw, l)
			idx++
		}
		hunkCounter++
		hunks = append(hunks, GitDiffHunk{
			ID:       fmt.Sprintf("h%d", hunkCounter),
			Header:   line,
			OldStart: oldStart,
			OldLines: oldLines,
			NewStart: newStart,
			NewLines: newLines,
			Lines:    hunkLines,
			Patch:    strings.Join(raw, "\n") + "\n",
		})
	}
	return hunks
}

func stableLineID(path, kind, content string, oldLine, newLine int) string {
	return hashString(fmt.Sprintf("%s|%s|%d|%d|%s", path, kind, oldLine, newLine, content))
}

func parseUnifiedHunksV2(path, patch string) ([]GitDiffHunkV2, GitDiffStatsV2) {
	lines := strings.Split(patch, "\n")
	hunks := make([]GitDiffHunkV2, 0)
	stats := GitDiffStatsV2{}
	idx := 0
	hunkCounter := 0
	for idx < len(lines) {
		line := lines[idx]
		if !strings.HasPrefix(line, "@@ ") {
			idx++
			continue
		}
		m := hunkHeaderRe.FindStringSubmatch(line)
		if len(m) == 0 {
			idx++
			continue
		}
		oldStart := parseIntDefault(m[1], 0)
		oldLines := parseIntDefault(m[2], 1)
		newStart := parseIntDefault(m[3], 0)
		newLines := parseIntDefault(m[4], 1)
		oldCur := oldStart
		newCur := newStart
		hunkLines := make([]GitDiffLineV2, 0)
		raw := []string{line}
		idx++
		for idx < len(lines) {
			l := lines[idx]
			if strings.HasPrefix(l, "@@ ") {
				break
			}
			if idx == len(lines)-1 && l == "" {
				idx++
				break
			}
			if strings.HasPrefix(l, "\\ No newline at end of file") {
				raw = append(raw, l)
				idx++
				continue
			}
			kind := "context"
			oldLine := 0
			newLine := 0
			selectable := false
			if strings.HasPrefix(l, "+") {
				kind = "add"
				newLine = newCur
				newCur++
				selectable = true
				stats.Added++
			} else if strings.HasPrefix(l, "-") {
				kind = "del"
				oldLine = oldCur
				oldCur++
				selectable = true
				stats.Deleted++
			} else {
				oldLine = oldCur
				newLine = newCur
				oldCur++
				newCur++
			}
			hunkLines = append(hunkLines, GitDiffLineV2{
				ID:         stableLineID(path, kind, l, oldLine, newLine),
				Kind:       kind,
				Content:    l,
				OldLine:    oldLine,
				NewLine:    newLine,
				Selectable: selectable,
			})
			raw = append(raw, l)
			stats.Lines++
			idx++
		}
		hunkCounter++
		hunks = append(hunks, GitDiffHunkV2{
			ID:       fmt.Sprintf("h%d", hunkCounter),
			Header:   line,
			OldStart: oldStart,
			OldLines: oldLines,
			NewStart: newStart,
			NewLines: newLines,
			Lines:    hunkLines,
			Patch:    strings.Join(raw, "\n") + "\n",
		})
	}
	stats.Hunks = len(hunks)
	return hunks, stats
}

func hashString(value string) string {
	h := sha1.Sum([]byte(value))
	return hex.EncodeToString(h[:])
}

func runGit(repoRoot string, args ...string) (string, error) {
	cmd := exec.Command("git", args...)
	cmd.Dir = repoRoot
	out, err := cmd.CombinedOutput()
	if err != nil {
		msg := strings.TrimSpace(string(out))
		if msg == "" {
			msg = err.Error()
		}
		return "", fmt.Errorf("%s", msg)
	}
	return string(out), nil
}

func runGitWithInput(repoRoot string, input string, args ...string) error {
	cmd := exec.Command("git", args...)
	cmd.Dir = repoRoot
	cmd.Stdin = strings.NewReader(input)
	out, err := cmd.CombinedOutput()
	if err != nil {
		msg := strings.TrimSpace(string(out))
		if msg == "" {
			msg = err.Error()
		}
		return fmt.Errorf("%s", msg)
	}
	return nil
}

func readWorkingFile(repoRoot, path string) string {
	content, err := os.ReadFile(filepath.Join(repoRoot, path))
	if err != nil {
		return ""
	}
	return string(content)
}

func gitShow(repoRoot, ref, path string) string {
	out, err := runGit(repoRoot, "show", fmt.Sprintf("%s:%s", ref, path))
	if err != nil {
		return ""
	}
	return out
}

func gitShowIndex(repoRoot, path string) string {
	out, err := runGit(repoRoot, "show", fmt.Sprintf(":%s", path))
	if err != nil {
		return ""
	}
	return out
}

func (h *GitHandler) buildFileDiff(path, filePath, mode string) (*GitInteractiveDiff, error) {
	repoRoot, err := h.getRepoRoot(path)
	if err != nil {
		return nil, err
	}
	diffArgs := []string{"diff", "--no-color", "--unified=3"}
	if mode == "staged" {
		diffArgs = append(diffArgs, "--cached")
	}
	diffArgs = append(diffArgs, "--", filePath)
	patch, err := runGit(repoRoot, diffArgs...)
	if err != nil {
		return nil, err
	}
	binary := strings.Contains(patch, "Binary files")
	hunks := parseUnifiedHunks(patch)
	oldContent := ""
	newContent := ""
	if mode == "staged" {
		oldContent = gitShow(repoRoot, "HEAD", filePath)
		newContent = gitShowIndex(repoRoot, filePath)
	} else {
		oldContent = gitShowIndex(repoRoot, filePath)
		if oldContent == "" {
			oldContent = gitShow(repoRoot, "HEAD", filePath)
		}
		newContent = readWorkingFile(repoRoot, filePath)
	}
	return &GitInteractiveDiff{
		Path:      filePath,
		Mode:      mode,
		Patch:     patch,
		PatchHash: hashString(patch),
		Hunks:     hunks,
		Old:       oldContent,
		New:       newContent,
		Binary:    binary,
	}, nil
}

func (h *GitHandler) buildFileDiffV2(path, filePath, mode string, unified int) (*GitInteractiveDiffV2, error) {
	repoRoot, err := h.getRepoRoot(path)
	if err != nil {
		return nil, err
	}
	diffArgs := []string{"diff", "--no-color", fmt.Sprintf("--unified=%d", unified)}
	if mode == "staged" {
		diffArgs = append(diffArgs, "--cached")
	}
	diffArgs = append(diffArgs, "--", filePath)
	patch, err := runGit(repoRoot, diffArgs...)
	if err != nil {
		return nil, err
	}
	binary := strings.Contains(patch, "Binary files")
	hunks, stats := parseUnifiedHunksV2(filePath, patch)
	oldContent := ""
	newContent := ""
	if mode == "staged" {
		oldContent = gitShow(repoRoot, "HEAD", filePath)
		newContent = gitShowIndex(repoRoot, filePath)
	} else {
		oldContent = gitShowIndex(repoRoot, filePath)
		if oldContent == "" {
			oldContent = gitShow(repoRoot, "HEAD", filePath)
		}
		newContent = readWorkingFile(repoRoot, filePath)
	}
	lineSelectable := stats.Lines <= 6000 && stats.Hunks <= 250
	return &GitInteractiveDiffV2{
		Path:       filePath,
		Mode:       mode,
		Patch:      patch,
		PatchHash:  hashString(patch),
		Hunks:      hunks,
		Stats:      stats,
		Capability: GitDiffCapabilityV2{LineSelectable: lineSelectable},
		Old:        oldContent,
		New:        newContent,
		Binary:     binary,
	}, nil
}

type GitFileDiffRequest struct {
	Path     string `json:"path" binding:"required"`
	FilePath string `json:"filePath" binding:"required"`
	Mode     string `json:"mode"`
}

func (h *GitHandler) FileDiff(c *gin.Context) {
	var req GitFileDiffRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	mode := req.Mode
	if mode == "" {
		mode = "working"
	}
	if mode != "working" && mode != "staged" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid mode"})
		return
	}
	d, err := h.buildFileDiff(req.Path, req.FilePath, mode)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, d)
}

func (h *GitHandler) FileDiffV2(c *gin.Context) {
	var req GitFileDiffRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	mode := req.Mode
	if mode == "" {
		mode = "working"
	}
	if mode != "working" && mode != "staged" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid mode"})
		return
	}
	d, err := h.buildFileDiffV2(req.Path, req.FilePath, mode, 3)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, d)
}

type GitChangeSelectionRequest struct {
	Path      string   `json:"path" binding:"required"`
	FilePath  string   `json:"filePath" binding:"required"`
	Mode      string   `json:"mode" binding:"required"`
	Action    string   `json:"action" binding:"required"`
	PatchHash string   `json:"patchHash" binding:"required"`
	HunkIDs   []string `json:"hunkIds" binding:"required"`
}

func buildSelectedPatch(filePath string, hunks []GitDiffHunk, selected map[string]bool) string {
	chunks := make([]string, 0, len(selected))
	for _, h := range hunks {
		if selected[h.ID] {
			chunks = append(chunks, h.Patch)
		}
	}
	if len(chunks) == 0 {
		return ""
	}
	header := fmt.Sprintf("--- a/%s\n+++ b/%s\n", filePath, filePath)
	return header + strings.Join(chunks, "")
}

func buildSelectedPatchV2ByHunk(filePath string, hunks []GitDiffHunkV2, selected map[string]bool) string {
	chunks := make([]string, 0, len(selected))
	for _, h := range hunks {
		if selected[h.ID] {
			chunks = append(chunks, h.Patch)
		}
	}
	if len(chunks) == 0 {
		return ""
	}
	header := fmt.Sprintf("--- a/%s\n+++ b/%s\n", filePath, filePath)
	return header + strings.Join(chunks, "")
}

func buildSelectedPatchV2ByLine(repoRoot, filePath, mode string, selected map[string]bool) (string, error) {
	diffArgs := []string{"diff", "--no-color", "--unified=0"}
	if mode == "staged" {
		diffArgs = append(diffArgs, "--cached")
	}
	diffArgs = append(diffArgs, "--", filePath)
	patch0, err := runGit(repoRoot, diffArgs...)
	if err != nil {
		return "", err
	}
	hunks0, _ := parseUnifiedHunksV2(filePath, patch0)
	out := make([]string, 0)
	for _, h := range hunks0 {
		selectedLines := make([]GitDiffLineV2, 0)
		for _, l := range h.Lines {
			if !l.Selectable {
				continue
			}
			if selected[l.ID] {
				selectedLines = append(selectedLines, l)
			}
		}
		if len(selectedLines) == 0 {
			continue
		}
		changeCount := 0
		for _, l := range h.Lines {
			if l.Selectable {
				changeCount++
			}
		}
		if len(selectedLines) == changeCount {
			out = append(out, h.Patch)
			continue
		}
		oldStart := 0
		newStart := 0
		oldLines := 0
		newLines := 0
		raw := make([]string, 0, len(selectedLines)+1)
		for _, l := range selectedLines {
			if l.Kind == "del" {
				if oldStart == 0 || (l.OldLine > 0 && l.OldLine < oldStart) {
					oldStart = l.OldLine
				}
				oldLines++
				raw = append(raw, l.Content)
			}
			if l.Kind == "add" {
				if newStart == 0 || (l.NewLine > 0 && l.NewLine < newStart) {
					newStart = l.NewLine
				}
				newLines++
				raw = append(raw, l.Content)
			}
		}
		if oldStart == 0 {
			if len(selectedLines) > 0 && selectedLines[0].NewLine > 0 {
				oldStart = selectedLines[0].NewLine - 1
			}
			if oldStart < 0 {
				oldStart = 0
			}
		}
		if newStart == 0 {
			if len(selectedLines) > 0 && selectedLines[0].OldLine > 0 {
				newStart = selectedLines[0].OldLine
			}
			if newStart < 0 {
				newStart = 0
			}
		}
		header := fmt.Sprintf("@@ -%d,%d +%d,%d @@", oldStart, oldLines, newStart, newLines)
		out = append(out, header+"\n"+strings.Join(raw, "\n")+"\n")
	}
	if len(out) == 0 {
		return "", nil
	}
	header := fmt.Sprintf("--- a/%s\n+++ b/%s\n", filePath, filePath)
	return header + strings.Join(out, ""), nil
}

func applySelection(repoRoot, mode, action, patch string) error {
	if mode == "working" {
		switch action {
		case "include":
			return runGitWithInput(repoRoot, patch, "apply", "--cached", "-")
		case "exclude":
			return runGitWithInput(repoRoot, patch, "apply", "--cached", "-R", "-")
		case "discard":
			return runGitWithInput(repoRoot, patch, "apply", "-R", "-")
		}
	}
	if mode == "staged" {
		switch action {
		case "include":
			return runGitWithInput(repoRoot, patch, "apply", "--cached", "-")
		case "exclude":
			return runGitWithInput(repoRoot, patch, "apply", "--cached", "-R", "-")
		case "discard":
			return runGitWithInput(repoRoot, patch, "apply", "-R", "--index", "-")
		}
	}
	return fmt.Errorf("invalid action")
}

func applySelectionV2(repoRoot, mode, action, patch string, zeroContext bool) error {
	if patch == "" {
		return fmt.Errorf("empty_patch")
	}
	zeroArgs := []string{}
	if zeroContext {
		zeroArgs = []string{"--unidiff-zero"}
	}
	if mode == "working" {
		switch action {
		case "include":
			args := []string{"apply", "--cached"}
			args = append(args, zeroArgs...)
			args = append(args, "-")
			return runGitWithInput(repoRoot, patch, args...)
		case "exclude":
			args := []string{"apply", "--cached", "-R"}
			args = append(args, zeroArgs...)
			args = append(args, "-")
			return runGitWithInput(repoRoot, patch, args...)
		case "discard":
			args := []string{"apply", "-R"}
			args = append(args, zeroArgs...)
			args = append(args, "-")
			return runGitWithInput(repoRoot, patch, args...)
		}
	}
	if mode == "staged" {
		switch action {
		case "include":
			args := []string{"apply", "--cached"}
			args = append(args, zeroArgs...)
			args = append(args, "-")
			return runGitWithInput(repoRoot, patch, args...)
		case "exclude":
			args := []string{"apply", "--cached", "-R"}
			args = append(args, zeroArgs...)
			args = append(args, "-")
			return runGitWithInput(repoRoot, patch, args...)
		case "discard":
			args := []string{"apply", "-R", "--index"}
			args = append(args, zeroArgs...)
			args = append(args, "-")
			return runGitWithInput(repoRoot, patch, args...)
		}
	}
	return fmt.Errorf("invalid action")
}

func (h *GitHandler) ChangeSelection(c *gin.Context) {
	var req GitChangeSelectionRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if req.Mode != "working" && req.Mode != "staged" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid mode"})
		return
	}
	if req.Action != "include" && req.Action != "exclude" && req.Action != "discard" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid action"})
		return
	}
	d, err := h.buildFileDiff(req.Path, req.FilePath, req.Mode)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if d.PatchHash != req.PatchHash {
		c.JSON(http.StatusConflict, gin.H{"error": "stale_patch", "code": "stale_patch"})
		return
	}
	selected := map[string]bool{}
	for _, id := range req.HunkIDs {
		selected[id] = true
	}
	patch := buildSelectedPatch(req.FilePath, d.Hunks, selected)
	if patch == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "no_hunks_selected"})
		return
	}
	repoRoot, err := h.getRepoRoot(req.Path)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if err := applySelection(repoRoot, req.Mode, req.Action, patch); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	structured, err := buildStructuredStatus(repoRoot)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	updatedDiff, _ := h.buildFileDiff(req.Path, req.FilePath, req.Mode)
	c.JSON(http.StatusOK, gin.H{"ok": true, "status": structured, "diff": updatedDiff})
}

type GitApplySelectionV2Request struct {
	Path      string   `json:"path" binding:"required"`
	FilePath  string   `json:"filePath" binding:"required"`
	Mode      string   `json:"mode" binding:"required"`
	Target    string   `json:"target" binding:"required"`
	Action    string   `json:"action" binding:"required"`
	PatchHash string   `json:"patchHash" binding:"required"`
	LineIDs   []string `json:"lineIds"`
	HunkIDs   []string `json:"hunkIds"`
}

func (h *GitHandler) ApplySelectionV2(c *gin.Context) {
	var req GitApplySelectionV2Request
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if req.Mode != "working" && req.Mode != "staged" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid mode"})
		return
	}
	if req.Action != "include" && req.Action != "exclude" && req.Action != "discard" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid action"})
		return
	}
	if req.Target != "line" && req.Target != "hunk" && req.Target != "file" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid target"})
		return
	}
	d, err := h.buildFileDiffV2(req.Path, req.FilePath, req.Mode, 3)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if d.PatchHash != req.PatchHash {
		c.JSON(http.StatusConflict, gin.H{"error": "stale_patch", "code": "stale_patch"})
		return
	}
	repoRoot, err := h.getRepoRoot(req.Path)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	patch := ""
	zeroContext := false
	switch req.Target {
	case "file":
		patch = d.Patch
	case "hunk":
		selectedHunks := map[string]bool{}
		for _, id := range req.HunkIDs {
			selectedHunks[id] = true
		}
		patch = buildSelectedPatchV2ByHunk(req.FilePath, d.Hunks, selectedHunks)
	case "line":
		selectedLines := map[string]bool{}
		for _, id := range req.LineIDs {
			selectedLines[id] = true
		}
		patch, err = buildSelectedPatchV2ByLine(repoRoot, req.FilePath, req.Mode, selectedLines)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		zeroContext = true
	}
	if strings.TrimSpace(patch) == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "no_selection"})
		return
	}
	if err := applySelectionV2(repoRoot, req.Mode, req.Action, patch, zeroContext); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	structured, err := buildStructuredStatus(repoRoot)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	updatedDiff, _ := h.buildFileDiffV2(req.Path, req.FilePath, req.Mode, 3)
	c.JSON(http.StatusOK, gin.H{
		"ok":     true,
		"status": structured,
		"diff":   updatedDiff,
	})
}

type GitStashFilesRequest struct {
	Path  string `json:"path" binding:"required"`
	Index int    `json:"index"`
}

type GitStashFile struct {
	Path   string `json:"path"`
	Status string `json:"status"`
}

func mapShortStatus(code string) string {
	switch code {
	case "A":
		return "added"
	case "D":
		return "deleted"
	case "M":
		return "modified"
	case "R":
		return "renamed"
	case "C":
		return "copied"
	default:
		return "modified"
	}
}

func (h *GitHandler) StashFiles(c *gin.Context) {
	var req GitStashFilesRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	repoRoot, err := h.getRepoRoot(req.Path)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	ref := fmt.Sprintf("stash@{%d}", req.Index)
	out, err := runGit(repoRoot, "stash", "show", "--name-status", "--format=", ref)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	files := make([]GitStashFile, 0)
	lines := strings.Split(strings.TrimSpace(out), "\n")
	for _, line := range lines {
		if strings.TrimSpace(line) == "" {
			continue
		}
		parts := strings.SplitN(line, "\t", 2)
		if len(parts) != 2 {
			continue
		}
		files = append(files, GitStashFile{Status: mapShortStatus(strings.TrimSpace(parts[0])), Path: strings.TrimSpace(parts[1])})
	}
	sort.Slice(files, func(i, j int) bool { return files[i].Path < files[j].Path })
	c.JSON(http.StatusOK, gin.H{"files": files})
}

type GitStashDiffRequest struct {
	Path     string `json:"path" binding:"required"`
	Index    int    `json:"index"`
	FilePath string `json:"filePath" binding:"required"`
}

func (h *GitHandler) StashDiff(c *gin.Context) {
	var req GitStashDiffRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	repoRoot, err := h.getRepoRoot(req.Path)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	ref := fmt.Sprintf("stash@{%d}", req.Index)
	oldContent := gitShow(repoRoot, ref+"^1", req.FilePath)
	newContent := gitShow(repoRoot, ref, req.FilePath)
	patch, _ := runGit(repoRoot, "stash", "show", "-p", "--format=", ref, "--", req.FilePath)
	hunks := parseUnifiedHunks(patch)
	c.JSON(http.StatusOK, gin.H{
		"path":      req.FilePath,
		"mode":      "stash",
		"old":       oldContent,
		"new":       newContent,
		"patch":     patch,
		"patchHash": hashString(patch),
		"hunks":     hunks,
		"binary":    strings.Contains(patch, "Binary files"),
	})
}

type GitConflictDetailsRequest struct {
	Path     string `json:"path" binding:"required"`
	FilePath string `json:"filePath" binding:"required"`
}

func parseConflictBlocks(content string) (string, string, string) {
	lines := strings.Split(content, "\n")
	var ours strings.Builder
	var base strings.Builder
	var theirs strings.Builder
	mode := "none"
	for _, line := range lines {
		if strings.HasPrefix(line, "<<<<<<<") {
			mode = "ours"
			continue
		}
		if strings.HasPrefix(line, "|||||||") {
			mode = "base"
			continue
		}
		if strings.HasPrefix(line, "=======") {
			mode = "theirs"
			continue
		}
		if strings.HasPrefix(line, ">>>>>>>") {
			mode = "none"
			continue
		}
		switch mode {
		case "ours":
			ours.WriteString(line)
			ours.WriteString("\n")
		case "base":
			base.WriteString(line)
			base.WriteString("\n")
		case "theirs":
			theirs.WriteString(line)
			theirs.WriteString("\n")
		}
	}
	return strings.TrimRight(ours.String(), "\n"), strings.TrimRight(base.String(), "\n"), strings.TrimRight(theirs.String(), "\n")
}

func (h *GitHandler) ConflictDetails(c *gin.Context) {
	var req GitConflictDetailsRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	repoRoot, err := h.getRepoRoot(req.Path)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	contentBytes, err := os.ReadFile(filepath.Join(repoRoot, req.FilePath))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	content := string(contentBytes)
	ours, base, theirs := parseConflictBlocks(content)
	c.JSON(http.StatusOK, gin.H{"path": req.FilePath, "content": content, "ours": ours, "base": base, "theirs": theirs})
}

type GitConflictResolveRequest struct {
	Path     string `json:"path" binding:"required"`
	FilePath string `json:"filePath" binding:"required"`
	Mode     string `json:"mode" binding:"required"`
	Content  string `json:"content"`
}

func (h *GitHandler) ConflictResolve(c *gin.Context) {
	var req GitConflictResolveRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	repoRoot, err := h.getRepoRoot(req.Path)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if req.Mode != "ours" && req.Mode != "theirs" && req.Mode != "manual" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid mode"})
		return
	}
	switch req.Mode {
	case "ours":
		_, err = runGit(repoRoot, "checkout", "--ours", "--", req.FilePath)
	case "theirs":
		_, err = runGit(repoRoot, "checkout", "--theirs", "--", req.FilePath)
	case "manual":
		err = os.WriteFile(filepath.Join(repoRoot, req.FilePath), []byte(req.Content), 0644)
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if _, err := runGit(repoRoot, "add", "--", req.FilePath); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	conflictsOut, _ := runGit(repoRoot, "diff", "--name-only", "--diff-filter=U")
	conflicts := make([]string, 0)
	for _, line := range strings.Split(strings.TrimSpace(conflictsOut), "\n") {
		line = strings.TrimSpace(line)
		if line != "" {
			conflicts = append(conflicts, line)
		}
	}
	c.JSON(http.StatusOK, gin.H{"ok": true, "conflicts": conflicts})
}

type GitConflictSegmentV2 struct {
	Type    string   `json:"type"`
	Text    string   `json:"text,omitempty"`
	BlockID string   `json:"blockId,omitempty"`
	Ours    []string `json:"ours,omitempty"`
	Base    []string `json:"base,omitempty"`
	Theirs  []string `json:"theirs,omitempty"`
}

type GitConflictDetailsV2Response struct {
	Path        string                 `json:"path"`
	Hash        string                 `json:"hash"`
	Segments    []GitConflictSegmentV2 `json:"segments"`
	BlocksTotal int                    `json:"blocksTotal"`
}

type GitConflictResolveV2Request struct {
	Path            string `json:"path" binding:"required"`
	FilePath        string `json:"filePath" binding:"required"`
	Mode            string `json:"mode" binding:"required"`
	Hash            string `json:"hash" binding:"required"`
	ResolvedContent string `json:"resolvedContent"`
	ManualContent   string `json:"manualContent"`
}

func parseConflictSegmentsV2(content string) ([]GitConflictSegmentV2, int) {
	lines := strings.Split(content, "\n")
	segments := make([]GitConflictSegmentV2, 0)
	plain := make([]string, 0)
	mode := "plain"
	ours := make([]string, 0)
	base := make([]string, 0)
	theirs := make([]string, 0)
	blockIndex := 0
	flushPlain := func() {
		if len(plain) == 0 {
			return
		}
		segments = append(segments, GitConflictSegmentV2{
			Type: "plain",
			Text: strings.Join(plain, "\n"),
		})
		plain = plain[:0]
	}
	flushBlock := func() {
		blockIndex++
		segments = append(segments, GitConflictSegmentV2{
			Type:    "conflict",
			BlockID: fmt.Sprintf("b%d", blockIndex),
			Ours:    append([]string{}, ours...),
			Base:    append([]string{}, base...),
			Theirs:  append([]string{}, theirs...),
		})
		ours = ours[:0]
		base = base[:0]
		theirs = theirs[:0]
	}
	for _, line := range lines {
		switch {
		case strings.HasPrefix(line, "<<<<<<<"):
			flushPlain()
			mode = "ours"
		case strings.HasPrefix(line, "|||||||"):
			mode = "base"
		case strings.HasPrefix(line, "======="):
			mode = "theirs"
		case strings.HasPrefix(line, ">>>>>>>"):
			mode = "plain"
			flushBlock()
		default:
			if mode == "ours" {
				ours = append(ours, line)
			} else if mode == "base" {
				base = append(base, line)
			} else if mode == "theirs" {
				theirs = append(theirs, line)
			} else {
				plain = append(plain, line)
			}
		}
	}
	flushPlain()
	return segments, blockIndex
}

func readConflictFile(repoRoot, filePath string) (string, string, error) {
	contentBytes, err := os.ReadFile(filepath.Join(repoRoot, filePath))
	if err != nil {
		return "", "", err
	}
	content := string(contentBytes)
	return content, hashString(content), nil
}

func (h *GitHandler) ConflictDetailsV2(c *gin.Context) {
	var req GitConflictDetailsRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	repoRoot, err := h.getRepoRoot(req.Path)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	content, hash, err := readConflictFile(repoRoot, req.FilePath)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	segments, blocksTotal := parseConflictSegmentsV2(content)
	c.JSON(http.StatusOK, GitConflictDetailsV2Response{
		Path:        req.FilePath,
		Hash:        hash,
		Segments:    segments,
		BlocksTotal: blocksTotal,
	})
}

func collectConflicts(repoRoot string) []string {
	conflictsOut, _ := runGit(repoRoot, "diff", "--name-only", "--diff-filter=U")
	conflicts := make([]string, 0)
	for _, line := range strings.Split(strings.TrimSpace(conflictsOut), "\n") {
		line = strings.TrimSpace(line)
		if line != "" {
			conflicts = append(conflicts, line)
		}
	}
	return conflicts
}

func (h *GitHandler) ConflictResolveV2(c *gin.Context) {
	var req GitConflictResolveV2Request
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	repoRoot, err := h.getRepoRoot(req.Path)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if req.Mode != "line-map" && req.Mode != "manual" && req.Mode != "ours" && req.Mode != "theirs" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid mode"})
		return
	}
	content, currentHash, err := readConflictFile(repoRoot, req.FilePath)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if currentHash != req.Hash {
		c.JSON(http.StatusConflict, gin.H{"error": "stale_conflict", "code": "stale_conflict"})
		return
	}
	_ = content
	switch req.Mode {
	case "ours":
		_, err = runGit(repoRoot, "checkout", "--ours", "--", req.FilePath)
	case "theirs":
		_, err = runGit(repoRoot, "checkout", "--theirs", "--", req.FilePath)
	case "manual":
		err = os.WriteFile(filepath.Join(repoRoot, req.FilePath), []byte(req.ManualContent), 0644)
	case "line-map":
		err = os.WriteFile(filepath.Join(repoRoot, req.FilePath), []byte(req.ResolvedContent), 0644)
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if _, err := runGit(repoRoot, "add", "--", req.FilePath); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	status, err := buildStructuredStatus(repoRoot)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"ok":        true,
		"conflicts": collectConflicts(repoRoot),
		"status":    status,
	})
}
