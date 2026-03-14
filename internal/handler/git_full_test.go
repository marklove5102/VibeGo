package handler

import (
	"encoding/json"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/go-git/go-git/v6"
	"github.com/go-git/go-git/v6/plumbing/object"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func setupFullRepo(t *testing.T) string {
	dir, err := os.MkdirTemp("", "git-full-test")
	require.NoError(t, err)
	repo, err := git.PlainInit(dir, false)
	require.NoError(t, err)
	wt, err := repo.Worktree()
	require.NoError(t, err)

	require.NoError(t, os.WriteFile(filepath.Join(dir, "README.md"), []byte("# Test\n"), 0644))
	_, err = wt.Add("README.md")
	require.NoError(t, err)
	_, err = wt.Commit("initial commit", &git.CommitOptions{
		Author: &object.Signature{Name: "Test", Email: "test@test.com", When: time.Now()},
	})
	require.NoError(t, err)

	require.NoError(t, os.WriteFile(filepath.Join(dir, "main.go"), []byte("package main\n\nfunc main() {}\n"), 0644))
	_, err = wt.Add("main.go")
	require.NoError(t, err)
	_, err = wt.Commit("add main.go", &git.CommitOptions{
		Author: &object.Signature{Name: "Test", Email: "test@test.com", When: time.Now()},
	})
	require.NoError(t, err)

	require.NoError(t, os.WriteFile(filepath.Join(dir, "hello.txt"), []byte("hello world\n"), 0644))
	_, err = wt.Add("hello.txt")
	require.NoError(t, err)
	_, err = wt.Commit("add hello.txt", &git.CommitOptions{
		Author: &object.Signature{Name: "Test", Email: "test@test.com", When: time.Now()},
	})
	require.NoError(t, err)

	cmd := exec.Command("git", "checkout", "-b", "feature-a")
	cmd.Dir = dir
	require.NoError(t, cmd.Run())
	require.NoError(t, os.WriteFile(filepath.Join(dir, "feature-a.txt"), []byte("feature a\n"), 0644))
	cmd = exec.Command("git", "add", "feature-a.txt")
	cmd.Dir = dir
	require.NoError(t, cmd.Run())
	cmd = exec.Command("git", "-c", "user.name=Test", "-c", "user.email=test@test.com", "commit", "-m", "feature-a work")
	cmd.Dir = dir
	require.NoError(t, cmd.Run())

	cmd = exec.Command("git", "checkout", "master")
	cmd.Dir = dir
	if cmd.Run() != nil {
		cmd = exec.Command("git", "checkout", "main")
		cmd.Dir = dir
		cmd.Run()
	}

	cmd = exec.Command("git", "checkout", "-b", "feature-b")
	cmd.Dir = dir
	require.NoError(t, cmd.Run())
	require.NoError(t, os.WriteFile(filepath.Join(dir, "feature-b.txt"), []byte("feature b\n"), 0644))
	cmd = exec.Command("git", "add", "feature-b.txt")
	cmd.Dir = dir
	require.NoError(t, cmd.Run())
	cmd = exec.Command("git", "-c", "user.name=Test", "-c", "user.email=test@test.com", "commit", "-m", "feature-b work")
	cmd.Dir = dir
	require.NoError(t, cmd.Run())

	cmd = exec.Command("git", "checkout", "master")
	cmd.Dir = dir
	if cmd.Run() != nil {
		cmd = exec.Command("git", "checkout", "main")
		cmd.Dir = dir
		cmd.Run()
	}

	return dir
}

func TestGitFullCheck(t *testing.T) {
	dir := setupFullRepo(t)
	defer os.RemoveAll(dir)
	r, _ := setupRouter()

	w := postJSON(r, "/git/check", map[string]string{"path": dir})
	assert.Equal(t, http.StatusOK, w.Code)
	var resp map[string]bool
	json.Unmarshal(w.Body.Bytes(), &resp)
	assert.True(t, resp["isRepo"])

	w = postJSON(r, "/git/check", map[string]string{"path": "/tmp/nonexistent-xyz"})
	assert.Equal(t, http.StatusOK, w.Code)
	json.Unmarshal(w.Body.Bytes(), &resp)
	assert.False(t, resp["isRepo"])
}

func TestGitFullStructuredStatus(t *testing.T) {
	dir := setupFullRepo(t)
	defer os.RemoveAll(dir)
	r, _ := setupRouter()

	require.NoError(t, os.WriteFile(filepath.Join(dir, "hello.txt"), []byte("hello world\nmodified\n"), 0644))
	require.NoError(t, os.WriteFile(filepath.Join(dir, "new-file.txt"), []byte("new\n"), 0644))

	w := postJSON(r, "/git/status", map[string]string{"path": dir})
	assert.Equal(t, http.StatusOK, w.Code)
	var resp struct {
		Files   []StructuredFile `json:"files"`
		Summary StatusSummary    `json:"summary"`
	}
	json.Unmarshal(w.Body.Bytes(), &resp)
	assert.GreaterOrEqual(t, len(resp.Files), 2)
	assert.GreaterOrEqual(t, resp.Summary.Changed, 2)
}

func TestGitFullFileDiff(t *testing.T) {
	dir := setupFullRepo(t)
	defer os.RemoveAll(dir)
	r, _ := setupRouter()

	require.NoError(t, os.WriteFile(filepath.Join(dir, "hello.txt"), []byte("hello world\nnew line\n"), 0644))

	w := postJSON(r, "/git/file-diff", map[string]interface{}{
		"path": dir, "filePath": "hello.txt", "mode": "working",
	})
	assert.Equal(t, http.StatusOK, w.Code)
	var resp InteractiveDiff
	json.Unmarshal(w.Body.Bytes(), &resp)
	assert.Equal(t, "hello.txt", resp.Path)
	assert.Equal(t, "working", resp.Mode)
	assert.NotEmpty(t, resp.Hunks)
	assert.NotEmpty(t, resp.Patch)
	assert.NotEmpty(t, resp.PatchHash)
	assert.Greater(t, resp.Stats.Added, 0)
}

func TestGitFullFileDiffStaged(t *testing.T) {
	dir := setupFullRepo(t)
	defer os.RemoveAll(dir)
	r, _ := setupRouter()

	require.NoError(t, os.WriteFile(filepath.Join(dir, "hello.txt"), []byte("staged content\n"), 0644))
	cmd := exec.Command("git", "add", "hello.txt")
	cmd.Dir = dir
	require.NoError(t, cmd.Run())

	w := postJSON(r, "/git/file-diff", map[string]interface{}{
		"path": dir, "filePath": "hello.txt", "mode": "staged",
	})
	assert.Equal(t, http.StatusOK, w.Code)
	var resp InteractiveDiff
	json.Unmarshal(w.Body.Bytes(), &resp)
	assert.Equal(t, "staged", resp.Mode)
	assert.NotEmpty(t, resp.Hunks)
}

func TestGitFullApplySelectionInclude(t *testing.T) {
	dir := setupFullRepo(t)
	defer os.RemoveAll(dir)
	r, _ := setupRouter()

	require.NoError(t, os.WriteFile(filepath.Join(dir, "hello.txt"), []byte("hello world\nselected\n"), 0644))

	w := postJSON(r, "/git/file-diff", map[string]interface{}{
		"path": dir, "filePath": "hello.txt", "mode": "working",
	})
	require.Equal(t, http.StatusOK, w.Code)
	var diffResp InteractiveDiff
	json.Unmarshal(w.Body.Bytes(), &diffResp)
	require.NotEmpty(t, diffResp.Hunks)

	w = postJSON(r, "/git/apply-selection", map[string]interface{}{
		"path": dir, "filePath": "hello.txt", "mode": "working",
		"target": "hunk", "action": "include",
		"patchHash": diffResp.PatchHash,
		"lineIds":   []string{}, "hunkIds": []string{diffResp.Hunks[0].ID},
	})
	assert.Equal(t, http.StatusOK, w.Code)
	var resp struct {
		OK     bool `json:"ok"`
		Status struct {
			Files []StructuredFile `json:"files"`
		} `json:"status"`
	}
	json.Unmarshal(w.Body.Bytes(), &resp)
	assert.True(t, resp.OK)
}

func TestGitFullApplySelectionExclude(t *testing.T) {
	dir := setupFullRepo(t)
	defer os.RemoveAll(dir)
	r, _ := setupRouter()

	require.NoError(t, os.WriteFile(filepath.Join(dir, "hello.txt"), []byte("excluded\n"), 0644))
	cmd := exec.Command("git", "add", "hello.txt")
	cmd.Dir = dir
	require.NoError(t, cmd.Run())

	w := postJSON(r, "/git/apply-selection", map[string]interface{}{
		"path": dir, "filePath": "hello.txt", "mode": "staged",
		"target": "file", "action": "exclude",
		"patchHash": "", "lineIds": []string{}, "hunkIds": []string{},
	})
	assert.Equal(t, http.StatusOK, w.Code)
	var resp struct {
		OK bool `json:"ok"`
	}
	json.Unmarshal(w.Body.Bytes(), &resp)
	assert.True(t, resp.OK)
}

func TestGitFullApplySelectionExcludeStagedLine(t *testing.T) {
	dir := setupFullRepo(t)
	defer os.RemoveAll(dir)
	r, _ := setupRouter()

	require.NoError(t, os.WriteFile(filepath.Join(dir, "hello.txt"), []byte("one\ntwo\nthree\n"), 0644))
	cmd := exec.Command("git", "add", "hello.txt")
	cmd.Dir = dir
	require.NoError(t, cmd.Run())
	cmd = exec.Command("git", "-c", "user.name=Test", "-c", "user.email=test@test.com", "commit", "-m", "seed staged partial")
	cmd.Dir = dir
	require.NoError(t, cmd.Run())

	require.NoError(t, os.WriteFile(filepath.Join(dir, "hello.txt"), []byte("ONE\ntwo\nTHREE\n"), 0644))
	cmd = exec.Command("git", "add", "hello.txt")
	cmd.Dir = dir
	require.NoError(t, cmd.Run())

	w := postJSON(r, "/git/file-diff", map[string]interface{}{
		"path": dir, "filePath": "hello.txt", "mode": "staged",
	})
	require.Equal(t, http.StatusOK, w.Code)

	var diffResp InteractiveDiff
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &diffResp))
	require.NotEmpty(t, diffResp.Hunks)

	lineIDs := make([]string, 0)
	for _, hunk := range diffResp.Hunks {
		for _, line := range hunk.Lines {
			if (line.Content == "three" || line.Content == "THREE") && line.Selectable {
				lineIDs = append(lineIDs, line.ID)
			}
		}
	}
	require.Len(t, lineIDs, 2)

	w = postJSON(r, "/git/apply-selection", map[string]interface{}{
		"path": dir, "filePath": "hello.txt", "mode": "staged",
		"target": "line", "action": "exclude",
		"patchHash": diffResp.PatchHash,
		"lineIds":   lineIDs, "hunkIds": []string{},
	})
	require.Equal(t, http.StatusOK, w.Code, w.Body.String())

	cmd = exec.Command("git", "diff", "--cached", "--", "hello.txt")
	cmd.Dir = dir
	stagedDiff, err := cmd.Output()
	require.NoError(t, err)
	assert.Contains(t, string(stagedDiff), "-one")
	assert.Contains(t, string(stagedDiff), "+ONE")
	assert.NotContains(t, string(stagedDiff), "-three")
	assert.NotContains(t, string(stagedDiff), "+THREE")

	cmd = exec.Command("git", "diff", "--", "hello.txt")
	cmd.Dir = dir
	workingDiff, err := cmd.Output()
	require.NoError(t, err)
	assert.Contains(t, string(workingDiff), "-three")
	assert.Contains(t, string(workingDiff), "+THREE")
	assert.NotContains(t, string(workingDiff), "-one")
}

func TestGitFullApplySelectionIncludeStagedFile(t *testing.T) {
	dir := setupFullRepo(t)
	defer os.RemoveAll(dir)
	r, _ := setupRouter()

	require.NoError(t, os.WriteFile(filepath.Join(dir, "hello.txt"), []byte("ONE\ntwo\nTHREE\n"), 0644))

	w := postJSON(r, "/git/apply-selection", map[string]interface{}{
		"path": dir, "filePath": "hello.txt", "mode": "staged",
		"target": "file", "action": "include",
		"patchHash": "", "lineIds": []string{}, "hunkIds": []string{},
	})
	require.Equal(t, http.StatusOK, w.Code, w.Body.String())

	cmd := exec.Command("git", "diff", "--cached", "--", "hello.txt")
	cmd.Dir = dir
	stagedDiff, err := cmd.Output()
	require.NoError(t, err)
	assert.Contains(t, string(stagedDiff), "-hello world")
	assert.Contains(t, string(stagedDiff), "+ONE")
	assert.Contains(t, string(stagedDiff), "+THREE")

	cmd = exec.Command("git", "diff", "--", "hello.txt")
	cmd.Dir = dir
	workingDiff, err := cmd.Output()
	require.NoError(t, err)
	assert.Empty(t, string(workingDiff))
}

func TestGitFullApplySelectionIncludeStagedLine(t *testing.T) {
	dir := setupFullRepo(t)
	defer os.RemoveAll(dir)
	r, _ := setupRouter()

	require.NoError(t, os.WriteFile(filepath.Join(dir, "hello.txt"), []byte("one\ntwo\nthree\n"), 0644))
	cmd := exec.Command("git", "add", "hello.txt")
	cmd.Dir = dir
	require.NoError(t, cmd.Run())
	cmd = exec.Command("git", "-c", "user.name=Test", "-c", "user.email=test@test.com", "commit", "-m", "seed staged include")
	cmd.Dir = dir
	require.NoError(t, cmd.Run())

	require.NoError(t, os.WriteFile(filepath.Join(dir, "hello.txt"), []byte("ONE\ntwo\nTHREE\n"), 0644))

	w := postJSON(r, "/git/file-diff", map[string]interface{}{
		"path": dir, "filePath": "hello.txt", "mode": "working",
	})
	require.Equal(t, http.StatusOK, w.Code)

	var diffResp InteractiveDiff
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &diffResp))
	require.NotEmpty(t, diffResp.Hunks)

	lineIDs := make([]string, 0)
	for _, hunk := range diffResp.Hunks {
		for _, line := range hunk.Lines {
			if (line.Content == "one" || line.Content == "ONE") && line.Selectable {
				lineIDs = append(lineIDs, line.ID)
			}
		}
	}
	require.Len(t, lineIDs, 2)

	w = postJSON(r, "/git/apply-selection", map[string]interface{}{
		"path": dir, "filePath": "hello.txt", "mode": "staged",
		"target": "line", "action": "include",
		"patchHash": diffResp.PatchHash,
		"lineIds":   lineIDs, "hunkIds": []string{},
	})
	require.Equal(t, http.StatusOK, w.Code, w.Body.String())

	cmd = exec.Command("git", "diff", "--cached", "--", "hello.txt")
	cmd.Dir = dir
	stagedDiff, err := cmd.Output()
	require.NoError(t, err)
	assert.Contains(t, string(stagedDiff), "-one")
	assert.Contains(t, string(stagedDiff), "+ONE")
	assert.NotContains(t, string(stagedDiff), "-three")
	assert.NotContains(t, string(stagedDiff), "+THREE")

	cmd = exec.Command("git", "diff", "--", "hello.txt")
	cmd.Dir = dir
	workingDiff, err := cmd.Output()
	require.NoError(t, err)
	assert.Contains(t, string(workingDiff), "-three")
	assert.Contains(t, string(workingDiff), "+THREE")
	assert.NotContains(t, string(workingDiff), "-one")
}

func TestGitFullApplySelectionDiscard(t *testing.T) {
	dir := setupFullRepo(t)
	defer os.RemoveAll(dir)
	r, _ := setupRouter()

	require.NoError(t, os.WriteFile(filepath.Join(dir, "hello.txt"), []byte("will be discarded\n"), 0644))

	w := postJSON(r, "/git/apply-selection", map[string]interface{}{
		"path": dir, "filePath": "hello.txt", "mode": "working",
		"target": "file", "action": "discard",
		"patchHash": "", "lineIds": []string{}, "hunkIds": []string{},
	})
	assert.Equal(t, http.StatusOK, w.Code)

	content, _ := os.ReadFile(filepath.Join(dir, "hello.txt"))
	assert.Equal(t, "hello world\n", string(content))
}

func TestGitFullServerSidePartialSelectionCommit(t *testing.T) {
	dir := setupFullRepo(t)
	defer os.RemoveAll(dir)
	r, h := setupRouter()

	require.NoError(t, os.WriteFile(filepath.Join(dir, "hello.txt"), []byte("one\ntwo\nthree\n"), 0644))
	cmd := exec.Command("git", "add", "hello.txt")
	cmd.Dir = dir
	require.NoError(t, cmd.Run())
	cmd = exec.Command("git", "-c", "user.name=Test", "-c", "user.email=test@test.com", "commit", "-m", "seed selection state")
	cmd.Dir = dir
	require.NoError(t, cmd.Run())

	require.NoError(t, os.WriteFile(filepath.Join(dir, "hello.txt"), []byte("ONE\ntwo\nTHREE\n"), 0644))

	w := postJSON(r, "/git/file-diff", map[string]interface{}{
		"path": dir, "filePath": "hello.txt", "mode": "working",
	})
	require.Equal(t, http.StatusOK, w.Code)

	var diffResp InteractiveDiff
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &diffResp))
	require.NotEmpty(t, diffResp.Hunks)

	lineIDs := make([]string, 0)
	for _, hunk := range diffResp.Hunks {
		for _, line := range hunk.Lines {
			if (line.Content == "three" || line.Content == "THREE") && line.Selectable {
				lineIDs = append(lineIDs, line.ID)
			}
		}
	}
	require.Len(t, lineIDs, 2)

	w = postJSON(r, "/git/apply-selection", map[string]interface{}{
		"path": dir, "filePath": "hello.txt", "mode": "working",
		"target": "line", "action": "exclude",
		"patchHash": diffResp.PatchHash,
		"lineIds":   lineIDs, "hunkIds": []string{},
	})
	require.Equal(t, http.StatusOK, w.Code)

	var applyResp struct {
		OK     bool `json:"ok"`
		Status struct {
			Files []StructuredFile `json:"files"`
		} `json:"status"`
		Diff InteractiveDiff `json:"diff"`
	}
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &applyResp))
	require.True(t, applyResp.OK)
	require.Equal(t, "partial", applyResp.Diff.IncludedState)

	found := false
	for _, file := range applyResp.Status.Files {
		if file.Path == "hello.txt" {
			found = true
			assert.Equal(t, "partial", file.IncludedState)
		}
	}
	require.True(t, found)

	debugDiff, err := getGitDiff(dir, "hello.txt", "working")
	require.NoError(t, err)
	selectionState := resolveSelectionState(h.selectionStore, dir, "hello.txt", debugDiff)
	require.Equal(t, "partial", selectionState.IncludedState)

	debugPatch := buildSelectionPatch(debugDiff, getSelectedLineIDsForState(selectionState, debugDiff))
	assert.Equal(t, strings.Join([]string{
		"--- a/hello.txt",
		"+++ b/hello.txt",
		"@@ -1,3 +1,3 @@",
		"-one",
		"+ONE",
		" two",
		" three",
		"",
	}, "\n"), debugPatch)

	w = postJSON(r, "/git/commit-selected", map[string]interface{}{
		"path":        dir,
		"files":       []string{},
		"patches":     []interface{}{},
		"summary":     "feat: backend selection",
		"description": "server side partial",
	})
	require.Equal(t, http.StatusOK, w.Code, w.Body.String())

	repo, err := git.PlainOpen(dir)
	require.NoError(t, err)
	head, err := repo.Head()
	require.NoError(t, err)
	commit, err := repo.CommitObject(head.Hash())
	require.NoError(t, err)
	assert.Contains(t, commit.Message, "feat: backend selection")
	assert.Contains(t, commit.Message, "server side partial")

	file, err := commit.File("hello.txt")
	require.NoError(t, err)
	reader, err := file.Reader()
	require.NoError(t, err)
	defer reader.Close()

	content, err := io.ReadAll(reader)
	require.NoError(t, err)
	assert.Equal(t, "ONE\ntwo\nthree\n", string(content))

	workingTreeContent, err := os.ReadFile(filepath.Join(dir, "hello.txt"))
	require.NoError(t, err)
	assert.Equal(t, "ONE\ntwo\nTHREE\n", string(workingTreeContent))
}

func TestGitFullStashViaAPI(t *testing.T) {
	dir := setupFullRepo(t)
	defer os.RemoveAll(dir)
	r, _ := setupRouter()

	require.NoError(t, os.WriteFile(filepath.Join(dir, "hello.txt"), []byte("stash me\n"), 0644))

	w := postJSON(r, "/git/stash", map[string]interface{}{
		"path": dir, "message": "api stash test",
	})
	assert.Equal(t, http.StatusOK, w.Code)
	var stashResp struct {
		OK      bool   `json:"ok"`
		Message string `json:"message"`
	}
	json.Unmarshal(w.Body.Bytes(), &stashResp)
	assert.True(t, stashResp.OK)

	content, _ := os.ReadFile(filepath.Join(dir, "hello.txt"))
	assert.Equal(t, "hello world\n", string(content))

	w = postJSON(r, "/git/stash-list", map[string]string{"path": dir})
	assert.Equal(t, http.StatusOK, w.Code)
	var listResp struct {
		Stashes []StashEntry `json:"stashes"`
	}
	json.Unmarshal(w.Body.Bytes(), &listResp)
	assert.NotEmpty(t, listResp.Stashes)

	w = postJSON(r, "/git/stash-pop", map[string]interface{}{"path": dir, "index": 0})
	assert.Equal(t, http.StatusOK, w.Code)

	content, _ = os.ReadFile(filepath.Join(dir, "hello.txt"))
	assert.Equal(t, "stash me\n", string(content))
}

func TestGitFullStashFiles(t *testing.T) {
	dir := setupFullRepo(t)
	defer os.RemoveAll(dir)
	r, _ := setupRouter()

	require.NoError(t, os.WriteFile(filepath.Join(dir, "hello.txt"), []byte("stash files test\n"), 0644))
	cmd := exec.Command("git", "stash", "push", "-m", "for stash-files test")
	cmd.Dir = dir
	require.NoError(t, cmd.Run())

	w := postJSON(r, "/git/stash-files", map[string]interface{}{"path": dir, "index": 0})
	assert.Equal(t, http.StatusOK, w.Code)
	var resp struct {
		Files []StashFileInfo `json:"files"`
	}
	json.Unmarshal(w.Body.Bytes(), &resp)
	assert.NotEmpty(t, resp.Files)

	found := false
	for _, f := range resp.Files {
		if f.Path == "hello.txt" {
			found = true
			assert.Equal(t, "modified", f.Status)
		}
	}
	assert.True(t, found)

	cmd = exec.Command("git", "stash", "drop")
	cmd.Dir = dir
	cmd.Run()
}

func TestGitFullStashDiff(t *testing.T) {
	dir := setupFullRepo(t)
	defer os.RemoveAll(dir)
	r, _ := setupRouter()

	require.NoError(t, os.WriteFile(filepath.Join(dir, "hello.txt"), []byte("stash diff test\n"), 0644))
	cmd := exec.Command("git", "stash", "push", "-m", "for stash-diff")
	cmd.Dir = dir
	require.NoError(t, cmd.Run())

	w := postJSON(r, "/git/stash-diff", map[string]interface{}{
		"path": dir, "index": 0, "filePath": "hello.txt",
	})
	assert.Equal(t, http.StatusOK, w.Code)
	var resp InteractiveDiff
	json.Unmarshal(w.Body.Bytes(), &resp)
	assert.Equal(t, "stash", resp.Mode)
	assert.NotEmpty(t, resp.Hunks)
	assert.NotEmpty(t, resp.Old)
	assert.NotEmpty(t, resp.New)

	cmd = exec.Command("git", "stash", "drop")
	cmd.Dir = dir
	cmd.Run()
}

func TestGitFullStashPartialFiles(t *testing.T) {
	dir := setupFullRepo(t)
	defer os.RemoveAll(dir)
	r, _ := setupRouter()

	require.NoError(t, os.WriteFile(filepath.Join(dir, "stash-a.txt"), []byte("a\n"), 0644))
	require.NoError(t, os.WriteFile(filepath.Join(dir, "stash-b.txt"), []byte("b\n"), 0644))

	w := postJSON(r, "/git/stash", map[string]interface{}{
		"path": dir, "message": "partial stash", "files": []string{"stash-a.txt"},
	})
	assert.Equal(t, http.StatusOK, w.Code)

	_, err := os.Stat(filepath.Join(dir, "stash-b.txt"))
	assert.NoError(t, err)

	cmd := exec.Command("git", "stash", "drop")
	cmd.Dir = dir
	cmd.Run()
}

func TestGitFullAddPatch(t *testing.T) {
	dir := setupFullRepo(t)
	defer os.RemoveAll(dir)
	r, _ := setupRouter()

	require.NoError(t, os.WriteFile(filepath.Join(dir, "hello.txt"), []byte("hello world\npatch line\n"), 0644))

	cmd := exec.Command("git", "diff", "--", "hello.txt")
	cmd.Dir = dir
	patchBytes, err := cmd.Output()
	require.NoError(t, err)
	require.NotEmpty(t, patchBytes)

	w := postJSON(r, "/git/add-patch", map[string]interface{}{
		"path": dir, "filePath": "hello.txt", "patch": string(patchBytes),
	})
	assert.Equal(t, http.StatusOK, w.Code)
	var resp struct {
		OK bool `json:"ok"`
	}
	json.Unmarshal(w.Body.Bytes(), &resp)
	assert.True(t, resp.OK)

	cmd = exec.Command("git", "diff", "--cached", "--name-only")
	cmd.Dir = dir
	out, _ := cmd.Output()
	assert.Contains(t, string(out), "hello.txt")
}

func TestGitFullCommitSelectedWithDescription(t *testing.T) {
	dir := setupFullRepo(t)
	defer os.RemoveAll(dir)
	r, _ := setupRouter()

	require.NoError(t, os.WriteFile(filepath.Join(dir, "selected.txt"), []byte("selected\n"), 0644))
	require.NoError(t, os.WriteFile(filepath.Join(dir, "excluded.txt"), []byte("excluded\n"), 0644))

	w := postJSON(r, "/git/commit-selected", map[string]interface{}{
		"path":        dir,
		"files":       []string{"selected.txt"},
		"patches":     []interface{}{},
		"summary":     "feat: selected only",
		"description": "detailed description",
	})
	assert.Equal(t, http.StatusOK, w.Code)
	var resp struct {
		OK   bool   `json:"ok"`
		Hash string `json:"hash"`
	}
	json.Unmarshal(w.Body.Bytes(), &resp)
	assert.True(t, resp.OK)
	assert.NotEmpty(t, resp.Hash)

	repo, _ := git.PlainOpen(dir)
	head, _ := repo.Head()
	commit, _ := repo.CommitObject(head.Hash())
	assert.Contains(t, commit.Message, "feat: selected only")
	assert.Contains(t, commit.Message, "detailed description")

	_, err := commit.File("selected.txt")
	assert.NoError(t, err)

	_, err = os.Stat(filepath.Join(dir, "excluded.txt"))
	assert.NoError(t, err)
}

func TestGitFullCommitSelectedWithPartialPatch(t *testing.T) {
	dir := setupFullRepo(t)
	defer os.RemoveAll(dir)
	r, _ := setupRouter()

	require.NoError(t, os.WriteFile(filepath.Join(dir, "hello.txt"), []byte("one\ntwo\nthree\n"), 0644))
	cmd := exec.Command("git", "add", "hello.txt")
	cmd.Dir = dir
	require.NoError(t, cmd.Run())
	cmd = exec.Command("git", "-c", "user.name=Test", "-c", "user.email=test@test.com", "commit", "-m", "seed hello.txt")
	cmd.Dir = dir
	require.NoError(t, cmd.Run())

	require.NoError(t, os.WriteFile(filepath.Join(dir, "hello.txt"), []byte("ONE\ntwo\nTHREE\n"), 0644))

	patch := strings.Join([]string{
		"--- a/hello.txt",
		"+++ b/hello.txt",
		"@@ -1,3 +1,3 @@",
		"-one",
		"+ONE",
		" two",
		" three",
		"",
	}, "\n")

	w := postJSON(r, "/git/commit-selected", map[string]interface{}{
		"path":  dir,
		"files": []string{},
		"patches": []map[string]string{
			{"filePath": "hello.txt", "patch": patch},
		},
		"summary": "feat: partial patch",
	})
	assert.Equal(t, http.StatusOK, w.Code)

	repo, err := git.PlainOpen(dir)
	require.NoError(t, err)
	head, err := repo.Head()
	require.NoError(t, err)
	commit, err := repo.CommitObject(head.Hash())
	require.NoError(t, err)

	file, err := commit.File("hello.txt")
	require.NoError(t, err)
	reader, err := file.Reader()
	require.NoError(t, err)
	defer reader.Close()

	content, err := io.ReadAll(reader)
	require.NoError(t, err)
	assert.Equal(t, "ONE\ntwo\nthree\n", string(content))

	workingTreeContent, err := os.ReadFile(filepath.Join(dir, "hello.txt"))
	require.NoError(t, err)
	assert.Equal(t, "ONE\ntwo\nTHREE\n", string(workingTreeContent))

	cmd = exec.Command("git", "diff", "--", "hello.txt")
	cmd.Dir = dir
	diffOutput, err := cmd.Output()
	require.NoError(t, err)
	assert.Contains(t, string(diffOutput), "-three")
	assert.Contains(t, string(diffOutput), "+THREE")
	assert.NotContains(t, string(diffOutput), "-one")
}

func TestGitFullAmendChangesMessage(t *testing.T) {
	dir := setupFullRepo(t)
	defer os.RemoveAll(dir)
	r, _ := setupRouter()

	require.NoError(t, os.WriteFile(filepath.Join(dir, "amend.txt"), []byte("amend\n"), 0644))

	w := postJSON(r, "/git/amend", map[string]interface{}{
		"path":    dir,
		"files":   []string{"amend.txt"},
		"patches": []interface{}{},
		"summary": "amended: new message",
	})
	assert.Equal(t, http.StatusOK, w.Code)

	repo, _ := git.PlainOpen(dir)
	head, _ := repo.Head()
	commit, _ := repo.CommitObject(head.Hash())
	assert.Equal(t, "amended: new message", strings.TrimSpace(commit.Message))
}

func TestGitFullUndoAndRedo(t *testing.T) {
	dir := setupFullRepo(t)
	defer os.RemoveAll(dir)
	r, _ := setupRouter()

	repo, _ := git.PlainOpen(dir)
	head1, _ := repo.Head()
	hash1 := head1.Hash().String()

	w := postJSON(r, "/git/undo", map[string]string{"path": dir})
	assert.Equal(t, http.StatusOK, w.Code)

	repo, _ = git.PlainOpen(dir)
	head2, _ := repo.Head()
	assert.NotEqual(t, hash1, head2.Hash().String())
}

func TestGitFullDeleteCurrentBranchFails(t *testing.T) {
	dir := setupFullRepo(t)
	defer os.RemoveAll(dir)
	r, _ := setupRouter()

	w := postJSON(r, "/git/branches", map[string]string{"path": dir})
	var brResp struct {
		CurrentBranch string `json:"currentBranch"`
	}
	json.Unmarshal(w.Body.Bytes(), &brResp)

	w = postJSON(r, "/git/delete-branch", map[string]string{"path": dir, "branch": brResp.CurrentBranch})
	assert.Equal(t, http.StatusBadRequest, w.Code)
	var errResp struct {
		Error string `json:"error"`
	}
	json.Unmarshal(w.Body.Bytes(), &errResp)
	assert.Contains(t, errResp.Error, "current branch")
}

func TestGitFullSwitchNonexistentBranch(t *testing.T) {
	dir := setupFullRepo(t)
	defer os.RemoveAll(dir)
	r, _ := setupRouter()

	w := postJSON(r, "/git/switch-branch", map[string]string{"path": dir, "branch": "nonexistent-xyz"})
	assert.Equal(t, http.StatusBadRequest, w.Code)
}

func TestGitFullCreateBranchFromRef(t *testing.T) {
	dir := setupFullRepo(t)
	defer os.RemoveAll(dir)
	r, _ := setupRouter()

	w := postJSON(r, "/git/create-branch", map[string]interface{}{
		"path": dir, "branch": "from-feature", "from": "feature-a",
	})
	assert.Equal(t, http.StatusOK, w.Code)
	var resp struct {
		OK     bool   `json:"ok"`
		Branch string `json:"branch"`
	}
	json.Unmarshal(w.Body.Bytes(), &resp)
	assert.True(t, resp.OK)
	assert.Equal(t, "from-feature", resp.Branch)
}

func TestGitFullSmartSwitchWithDirtyWorktree(t *testing.T) {
	dir := setupFullRepo(t)
	defer os.RemoveAll(dir)
	r, _ := setupRouter()

	require.NoError(t, os.WriteFile(filepath.Join(dir, "dirty.txt"), []byte("dirty\n"), 0644))

	w := postJSON(r, "/git/smart-switch-branch", map[string]string{"path": dir, "branch": "feature-a"})
	assert.Equal(t, http.StatusOK, w.Code)
	var resp struct {
		OK      bool   `json:"ok"`
		Branch  string `json:"branch"`
		Stashed bool   `json:"stashed"`
	}
	json.Unmarshal(w.Body.Bytes(), &resp)
	assert.True(t, resp.OK)
	assert.Equal(t, "feature-a", resp.Branch)
	assert.True(t, resp.Stashed)
}

func TestGitFullBranchStatusNoUpstream(t *testing.T) {
	dir := setupFullRepo(t)
	defer os.RemoveAll(dir)
	r, _ := setupRouter()

	w := postJSON(r, "/git/branch-status", map[string]string{"path": dir})
	assert.Equal(t, http.StatusOK, w.Code)
	var resp BranchStatusInfo
	json.Unmarshal(w.Body.Bytes(), &resp)
	assert.NotEmpty(t, resp.Branch)
	assert.Empty(t, resp.Upstream)
	assert.Equal(t, 0, resp.Ahead)
	assert.Equal(t, 0, resp.Behind)
}

func TestGitFullConflictsEmpty(t *testing.T) {
	dir := setupFullRepo(t)
	defer os.RemoveAll(dir)
	r, _ := setupRouter()

	w := postJSON(r, "/git/conflicts", map[string]string{"path": dir})
	assert.Equal(t, http.StatusOK, w.Code)
	var resp struct {
		Conflicts []string `json:"conflicts"`
	}
	json.Unmarshal(w.Body.Bytes(), &resp)
	assert.Empty(t, resp.Conflicts)
}

func TestGitFullRemotesEmpty(t *testing.T) {
	dir := setupFullRepo(t)
	defer os.RemoveAll(dir)
	r, _ := setupRouter()

	w := postJSON(r, "/git/remotes", map[string]string{"path": dir})
	assert.Equal(t, http.StatusOK, w.Code)
}

func TestGitFullCloneHasRemote(t *testing.T) {
	src := setupFullRepo(t)
	defer os.RemoveAll(src)

	dst, _ := os.MkdirTemp("", "git-clone-test")
	defer os.RemoveAll(dst)
	clonePath := filepath.Join(dst, "cloned")

	r, _ := setupRouter()
	w := postJSON(r, "/git/clone", map[string]string{"url": src, "path": clonePath})
	assert.Equal(t, http.StatusOK, w.Code)

	w = postJSON(r, "/git/remotes", map[string]string{"path": clonePath})
	assert.Equal(t, http.StatusOK, w.Code)
	var resp struct {
		Remotes []struct {
			Name string   `json:"name"`
			URLs []string `json:"urls"`
		} `json:"remotes"`
	}
	json.Unmarshal(w.Body.Bytes(), &resp)
	assert.NotEmpty(t, resp.Remotes)
	assert.Equal(t, "origin", resp.Remotes[0].Name)
}

func TestGitFullMissingPath(t *testing.T) {
	r, _ := setupRouter()

	w := postJSON(r, "/git/status", map[string]string{})
	assert.Equal(t, http.StatusBadRequest, w.Code)

	w = postJSON(r, "/git/log", map[string]string{})
	assert.Equal(t, http.StatusBadRequest, w.Code)
}

func TestGitFullDiffNonexistentFile(t *testing.T) {
	dir := setupFullRepo(t)
	defer os.RemoveAll(dir)
	r, _ := setupRouter()

	w := postJSON(r, "/git/diff", map[string]string{"path": dir, "filePath": "nonexistent.xyz"})
	assert.Equal(t, http.StatusOK, w.Code)
	var resp struct {
		Old string `json:"old"`
		New string `json:"new"`
	}
	json.Unmarshal(w.Body.Bytes(), &resp)
	assert.Empty(t, resp.Old)
	assert.Empty(t, resp.New)
}

func TestGitFullCheckoutNewFile(t *testing.T) {
	dir := setupFullRepo(t)
	defer os.RemoveAll(dir)
	r, _ := setupRouter()

	require.NoError(t, os.WriteFile(filepath.Join(dir, "untracked.txt"), []byte("untracked\n"), 0644))

	w := postJSON(r, "/git/checkout", map[string]interface{}{"path": dir, "files": []string{"untracked.txt"}})
	assert.Equal(t, http.StatusOK, w.Code)

	_, err := os.Stat(filepath.Join(dir, "untracked.txt"))
	assert.True(t, os.IsNotExist(err))
}

func TestGitFullCommitFilesInitialCommit(t *testing.T) {
	dir := setupFullRepo(t)
	defer os.RemoveAll(dir)
	r, _ := setupRouter()

	w := postJSON(r, "/git/log", map[string]interface{}{"path": dir, "limit": 100})
	var logResp struct {
		Commits []CommitInfo `json:"commits"`
	}
	json.Unmarshal(w.Body.Bytes(), &logResp)

	var initialHash string
	for _, c := range logResp.Commits {
		if c.ParentCount == 0 {
			initialHash = c.Hash
			break
		}
	}
	require.NotEmpty(t, initialHash)

	w = postJSON(r, "/git/commit-files", map[string]string{"path": dir, "commit": initialHash})
	assert.Equal(t, http.StatusOK, w.Code)
	var resp struct {
		Files []CommitFileInfo `json:"files"`
	}
	json.Unmarshal(w.Body.Bytes(), &resp)
	assert.NotEmpty(t, resp.Files)
	for _, f := range resp.Files {
		assert.Equal(t, "A", f.Status)
	}
}

func TestGitFullResetSpecificFiles(t *testing.T) {
	dir := setupFullRepo(t)
	defer os.RemoveAll(dir)
	r, _ := setupRouter()

	require.NoError(t, os.WriteFile(filepath.Join(dir, "a.txt"), []byte("a\n"), 0644))
	require.NoError(t, os.WriteFile(filepath.Join(dir, "b.txt"), []byte("b\n"), 0644))
	cmd := exec.Command("git", "add", "a.txt", "b.txt")
	cmd.Dir = dir
	require.NoError(t, cmd.Run())

	w := postJSON(r, "/git/reset", map[string]interface{}{"path": dir, "files": []string{"a.txt"}})
	assert.Equal(t, http.StatusOK, w.Code)

	cmd = exec.Command("git", "diff", "--cached", "--name-only")
	cmd.Dir = dir
	out, _ := cmd.Output()
	assert.NotContains(t, string(out), "a.txt")
	assert.Contains(t, string(out), "b.txt")
}

func TestGitFullShowWithRef(t *testing.T) {
	dir := setupFullRepo(t)
	defer os.RemoveAll(dir)
	r, _ := setupRouter()

	w := postJSON(r, "/git/show", map[string]string{
		"path": dir, "filePath": "feature-a.txt", "ref": "feature-a",
	})
	assert.Equal(t, http.StatusOK, w.Code)
	var resp struct {
		Content string `json:"content"`
	}
	json.Unmarshal(w.Body.Bytes(), &resp)
	assert.Equal(t, "feature a\n", resp.Content)
}

func TestGitFullShowInvalidRef(t *testing.T) {
	dir := setupFullRepo(t)
	defer os.RemoveAll(dir)
	r, _ := setupRouter()

	w := postJSON(r, "/git/show", map[string]string{
		"path": dir, "filePath": "README.md", "ref": "invalid-ref-xyz",
	})
	assert.Equal(t, http.StatusBadRequest, w.Code)
}

func TestGitFullCommitDiffContent(t *testing.T) {
	dir := setupFullRepo(t)
	defer os.RemoveAll(dir)
	r, _ := setupRouter()

	w := postJSON(r, "/git/log", map[string]interface{}{"path": dir, "limit": 1})
	var logResp struct {
		Commits []CommitInfo `json:"commits"`
	}
	json.Unmarshal(w.Body.Bytes(), &logResp)
	require.NotEmpty(t, logResp.Commits)

	w = postJSON(r, "/git/commit-diff", map[string]interface{}{
		"path": dir, "commit": logResp.Commits[0].Hash, "filePath": "hello.txt",
	})
	assert.Equal(t, http.StatusOK, w.Code)
	var resp struct {
		Path string `json:"path"`
		Old  string `json:"old"`
		New  string `json:"new"`
	}
	json.Unmarshal(w.Body.Bytes(), &resp)
	assert.Equal(t, "hello.txt", resp.Path)
	assert.NotEmpty(t, resp.New)
}

func TestGitFullBranchesListsAll(t *testing.T) {
	dir := setupFullRepo(t)
	defer os.RemoveAll(dir)
	r, _ := setupRouter()

	w := postJSON(r, "/git/branches", map[string]string{"path": dir})
	assert.Equal(t, http.StatusOK, w.Code)
	var resp struct {
		Branches      []BranchInfo `json:"branches"`
		CurrentBranch string       `json:"currentBranch"`
	}
	json.Unmarshal(w.Body.Bytes(), &resp)
	assert.GreaterOrEqual(t, len(resp.Branches), 3)
	assert.NotEmpty(t, resp.CurrentBranch)

	names := make(map[string]bool)
	for _, b := range resp.Branches {
		names[b.Name] = true
	}
	assert.True(t, names["feature-a"])
	assert.True(t, names["feature-b"])
}
