package handler

import "sync"

type fileSelectionState struct {
	PatchHash       string
	IncludedState   string
	SelectedLineIDs []string
}

type gitSelectionStore struct {
	mu    sync.RWMutex
	repos map[string]map[string]fileSelectionState
}

func newGitSelectionStore() *gitSelectionStore {
	return &gitSelectionStore{
		repos: make(map[string]map[string]fileSelectionState),
	}
}

func cloneSelectionState(state fileSelectionState) fileSelectionState {
	cloned := state
	if state.SelectedLineIDs != nil {
		cloned.SelectedLineIDs = append([]string(nil), state.SelectedLineIDs...)
	}
	return cloned
}

func (s *gitSelectionStore) get(repoRoot, filePath string) (fileSelectionState, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	files, ok := s.repos[repoRoot]
	if !ok {
		return fileSelectionState{}, false
	}

	state, ok := files[filePath]
	if !ok {
		return fileSelectionState{}, false
	}

	return cloneSelectionState(state), true
}

func (s *gitSelectionStore) set(repoRoot, filePath string, state fileSelectionState) {
	s.mu.Lock()
	defer s.mu.Unlock()

	files, ok := s.repos[repoRoot]
	if !ok {
		files = make(map[string]fileSelectionState)
		s.repos[repoRoot] = files
	}

	files[filePath] = cloneSelectionState(state)
}

func (s *gitSelectionStore) delete(repoRoot, filePath string) {
	s.mu.Lock()
	defer s.mu.Unlock()

	files, ok := s.repos[repoRoot]
	if !ok {
		return
	}

	delete(files, filePath)
	if len(files) == 0 {
		delete(s.repos, repoRoot)
	}
}

func (s *gitSelectionStore) resetRepo(repoRoot string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	delete(s.repos, repoRoot)
}

func (s *gitSelectionStore) pruneRepo(repoRoot string, validPaths map[string]struct{}) {
	s.mu.Lock()
	defer s.mu.Unlock()

	files, ok := s.repos[repoRoot]
	if !ok {
		return
	}

	for path := range files {
		if _, ok := validPaths[path]; !ok {
			delete(files, path)
		}
	}

	if len(files) == 0 {
		delete(s.repos, repoRoot)
	}
}
