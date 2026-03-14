import { useStore } from "zustand";
import { createStore, type StateCreator } from "zustand/vanilla";
import {
  type BranchStatusInfo,
  type CommitFileInfo,
  type GitCommit,
  type GitDiff,
  type GitInteractiveDiff,
  type GitStructuredFile,
  gitApi,
  type StashEntry,
} from "@/api/git";
import { useSettingsStore } from "@/lib/settings";

export interface GitFileNode {
  path: string;
  name: string;
  status: "modified" | "added" | "deleted" | "renamed" | "copied" | "untracked";
  includedState: "none" | "partial" | "all";
}

export interface GitPartialSelection {
  selectedRowIds: string[];
}

export interface GitSyncOptions {
  status?: boolean;
  history?: boolean;
  branches?: boolean;
  remotes?: boolean;
  branchStatus?: boolean;
  stashes?: boolean;
  conflicts?: boolean;
  silent?: boolean;
}

export interface GitState {
  currentPath: string | null;
  isRepo: boolean | null;
  allFiles: GitFileNode[];
  checkedFiles: Set<string>;
  partialSelections: Record<string, GitPartialSelection>;
  workingDiffs: Record<string, GitDiff>;
  interactiveDiffs: Record<string, GitInteractiveDiff>;
  summary: string;
  description: string;
  isAmend: boolean;
  currentBranch: string;
  branches: string[];
  remoteBranches: string[];
  aheadCount: number;
  behindCount: number;
  upstreamBranch: string | null;
  hasRemote: boolean;
  remoteUrls: string[];
  commits: GitCommit[];
  selectedCommit: GitCommit | null;
  selectedCommitFiles: CommitFileInfo[];
  activeTab: "changes" | "history";
  stashes: StashEntry[];
  conflicts: string[];
  isLoading: boolean;
  error: string | null;

  setCurrentPath: (path: string | null) => void;
  setSummary: (s: string) => void;
  setDescription: (d: string) => void;
  setIsAmend: (v: boolean) => void;
  setActiveTab: (tab: "changes" | "history") => void;
  setSelectedCommit: (c: GitCommit | null) => void;
  toggleFile: (path: string) => Promise<void>;
  toggleAllFiles: () => Promise<void>;
  setPartialSelection: (path: string, selectedRowIds: string[], selectableRowIds: string[]) => void;
  reset: () => void;

  checkRepo: () => Promise<boolean>;
  initRepo: () => Promise<boolean>;
  fetchStatus: () => Promise<void>;
  fetchLog: (limit?: number) => Promise<void>;
  fetchMoreLog: (limit?: number) => Promise<void>;
  fetchBranches: () => Promise<void>;
  fetchRemotes: () => Promise<void>;
  fetchBranchStatus: () => Promise<void>;
  fetchStashes: () => Promise<void>;
  fetchConflicts: () => Promise<void>;
  syncRepo: (options?: GitSyncOptions) => Promise<void>;

  commitSelected: () => Promise<boolean>;
  amendCommit: () => Promise<boolean>;
  undoLastCommit: () => Promise<boolean>;
  smartSwitchBranch: (branch: string) => Promise<boolean>;
  createBranch: (branch: string, from?: string) => Promise<boolean>;
  deleteBranch: (branch: string) => Promise<boolean>;
  gitFetch: () => Promise<boolean>;
  gitPull: () => Promise<boolean>;
  gitPush: () => Promise<boolean>;
  stash: (message?: string, files?: string[]) => Promise<boolean>;
  stashPop: (index?: number) => Promise<boolean>;
  stashDrop: (index?: number) => Promise<boolean>;
  discardFile: (path: string) => Promise<void>;
  resolveConflict: (filePath: string, content: string) => Promise<boolean>;
  getDiff: (filePath: string) => Promise<GitDiff | null>;
  getInteractiveDiff: (filePath: string, mode?: "working" | "staged") => Promise<GitInteractiveDiff | null>;
  applySelection: (
    filePath: string,
    mode: "working" | "staged",
    target: "line" | "hunk" | "file",
    action: "include" | "exclude" | "discard",
    patchHash: string,
    lineIds: string[],
    hunkIds: string[]
  ) => Promise<GitInteractiveDiff | null>;
  getCommitFiles: (commitHash: string) => Promise<CommitFileInfo[]>;
  getCommitDiff: (commitHash: string, filePath: string) => Promise<GitDiff | null>;
  addPatch: (filePath: string, patch: string) => Promise<boolean>;

  applyStatusUpdate: (files: GitStructuredFile[]) => void;
  applyBranchStatus: (bs: BranchStatusInfo) => void;
}

type GitSelector<T> = (state: GitState) => T;

const DEFAULT_GIT_STORE_ID = "__default__";

const mapStatus = (status: string): GitFileNode["status"] => {
  switch (status) {
    case "M":
    case "modified":
      return "modified";
    case "A":
    case "added":
      return "added";
    case "D":
    case "deleted":
      return "deleted";
    case "R":
    case "renamed":
      return "renamed";
    case "C":
    case "copied":
      return "copied";
    case "?":
    case "untracked":
      return "untracked";
    default:
      return "modified";
  }
};

const statusFilesToNodes = (files?: GitStructuredFile[] | null): GitFileNode[] => {
  const map = new Map<string, GitFileNode>();
  for (const file of files ?? []) {
    if (!map.has(file.path)) {
      map.set(file.path, {
        path: file.path,
        name: file.path.split("/").pop() || file.path,
        status: mapStatus(file.changeType || file.worktreeStatus || file.indexStatus),
        includedState: file.includedState ?? "all",
      });
    }
  }
  return Array.from(map.values()).sort((a, b) => a.path.localeCompare(b.path));
};

const getCheckedFilesForNodes = (nodes: GitFileNode[]) =>
  new Set(nodes.filter((node) => node.includedState !== "none").map((node) => node.path));

const getDefaultCommitSummary = () => useSettingsStore.getState().get("gitDefaultCommitMessage");

const getValidPathSet = (nodes: GitFileNode[]) => new Set(nodes.map((node) => node.path));

const pickWorkingDiffs = (nodes: GitFileNode[], workingDiffs: Record<string, GitDiff>) => {
  const validPaths = getValidPathSet(nodes);
  return Object.fromEntries(Object.entries(workingDiffs).filter(([path]) => validPaths.has(path)));
};

const pickInteractiveDiffs = (nodes: GitFileNode[], interactiveDiffs: Record<string, GitInteractiveDiff>) => {
  const validPaths = getValidPathSet(nodes);
  return Object.fromEntries(Object.entries(interactiveDiffs).filter(([path]) => validPaths.has(path)));
};

const createInitialGitSnapshot = () => ({
  currentPath: null as string | null,
  isRepo: null as boolean | null,
  allFiles: [] as GitFileNode[],
  checkedFiles: new Set<string>(),
  partialSelections: {} as Record<string, GitPartialSelection>,
  workingDiffs: {} as Record<string, GitDiff>,
  interactiveDiffs: {} as Record<string, GitInteractiveDiff>,
  summary: getDefaultCommitSummary(),
  description: "",
  isAmend: false,
  currentBranch: "main",
  branches: [] as string[],
  remoteBranches: [] as string[],
  aheadCount: 0,
  behindCount: 0,
  upstreamBranch: null as string | null,
  hasRemote: false,
  remoteUrls: [] as string[],
  commits: [] as GitCommit[],
  selectedCommit: null as GitCommit | null,
  selectedCommitFiles: [] as CommitFileInfo[],
  activeTab: "changes" as const,
  stashes: [] as StashEntry[],
  conflicts: [] as string[],
  isLoading: false,
  error: null as string | null,
});

const createGitState: StateCreator<GitState> = (set, get) => ({
  ...createInitialGitSnapshot(),

  setCurrentPath: (path) =>
    set((state) => ({
      currentPath: path,
      summary: state.summary || getDefaultCommitSummary(),
    })),
  setSummary: (summary) => set({ summary }),
  setDescription: (description) => set({ description }),
  setIsAmend: (isAmend) => set({ isAmend }),
  setActiveTab: (activeTab) => set({ activeTab }),
  setSelectedCommit: (selectedCommit) => set({ selectedCommit }),

  toggleFile: async (path) => {
    const { currentPath, allFiles } = get();
    if (!currentPath) {
      return;
    }

    const file = allFiles.find((item) => item.path === path);
    if (!file) {
      return;
    }

    const action = file.includedState === "none" ? "include" : "exclude";

    try {
      const res = await gitApi.applySelection(currentPath, path, "working", "file", action, "", [], []);
      const nodes = statusFilesToNodes(res.status.files);
      set((state) => ({
        allFiles: nodes,
        checkedFiles: getCheckedFilesForNodes(nodes),
        partialSelections: {},
        workingDiffs: pickWorkingDiffs(nodes, state.workingDiffs),
        interactiveDiffs: {
          ...pickInteractiveDiffs(nodes, state.interactiveDiffs),
          ...(res.diff ? { [path]: res.diff } : {}),
        },
      }));
    } catch (err) {
      set({ error: err instanceof Error ? err.message : "Failed to update selection" });
    }
  },

  toggleAllFiles: async () => {
    const { currentPath, allFiles } = get();
    if (!currentPath || allFiles.length === 0) {
      return;
    }

    const allIncluded = allFiles.every((file) => file.includedState === "all");
    const action = allIncluded ? "exclude" : "include";

    try {
      await Promise.all(
        allFiles.map((file) => gitApi.applySelection(currentPath, file.path, "working", "file", action, "", [], []))
      );
      await get().fetchStatus();
    } catch (err) {
      set({ error: err instanceof Error ? err.message : "Failed to update selection" });
    }
  },

  setPartialSelection: () => {},

  reset: () => set(createInitialGitSnapshot()),

  checkRepo: async () => {
    const { currentPath } = get();
    if (!currentPath) return false;
    try {
      const res = await gitApi.check(currentPath);
      set({ isRepo: res.isRepo });
      return res.isRepo;
    } catch {
      set({ isRepo: false });
      return false;
    }
  },

  initRepo: async () => {
    const { currentPath } = get();
    if (!currentPath) return false;
    try {
      await gitApi.init(currentPath);
      set({ isRepo: true, error: null });
      return true;
    } catch (err) {
      set({ error: err instanceof Error ? err.message : "Failed to init repository" });
      return false;
    }
  },

  applyStatusUpdate: (files) => {
    const nodes = statusFilesToNodes(files);
    const { workingDiffs, interactiveDiffs } = get();

    set({
      allFiles: nodes,
      checkedFiles: getCheckedFilesForNodes(nodes),
      partialSelections: {},
      workingDiffs: pickWorkingDiffs(nodes, workingDiffs),
      interactiveDiffs: pickInteractiveDiffs(nodes, interactiveDiffs),
    });
  },

  applyBranchStatus: (branchStatus) => {
    set({
      currentBranch: branchStatus.branch || get().currentBranch,
      upstreamBranch: branchStatus.upstream || null,
      aheadCount: branchStatus.ahead || 0,
      behindCount: branchStatus.behind || 0,
    });
  },

  fetchStatus: async () => {
    const { currentPath, isRepo } = get();
    if (!currentPath || isRepo === false) {
      return;
    }

    set({ isLoading: true, error: null });

    try {
      const res = await gitApi.status(currentPath);
      const nodes = statusFilesToNodes(res.files);
      const { workingDiffs, interactiveDiffs } = get();
      set({
        allFiles: nodes,
        checkedFiles: getCheckedFilesForNodes(nodes),
        partialSelections: {},
        workingDiffs: pickWorkingDiffs(nodes, workingDiffs),
        interactiveDiffs: pickInteractiveDiffs(nodes, interactiveDiffs),
      });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : "Failed to fetch status" });
    } finally {
      set({ isLoading: false });
    }
  },

  fetchLog: async (limit = 50) => {
    const { currentPath } = get();
    if (!currentPath) {
      return;
    }

    try {
      const res = await gitApi.log(currentPath, limit);
      set({ commits: res.commits });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : "Failed to fetch log" });
    }
  },

  fetchMoreLog: async (limit = 50) => {
    const { currentPath, commits } = get();
    if (!currentPath) {
      return;
    }

    try {
      const res = await gitApi.log(currentPath, limit, commits.length);
      if (res.commits.length > 0) {
        set({ commits: [...commits, ...res.commits] });
      }
    } catch (err) {
      set({ error: err instanceof Error ? err.message : "Failed to fetch log" });
    }
  },

  fetchBranches: async () => {
    const { currentPath } = get();
    if (!currentPath) {
      return;
    }

    try {
      const res = await gitApi.branches(currentPath);
      set({
        branches: res.branches.map((branch) => branch.name),
        remoteBranches: res.remoteBranches ?? [],
        currentBranch: res.currentBranch,
      });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : "Failed to fetch branches" });
    }
  },

  fetchRemotes: async () => {
    const { currentPath } = get();
    if (!currentPath) {
      return;
    }

    try {
      const res = await gitApi.remotes(currentPath);
      const urls = res.remotes.flatMap((r) => r.urls);
      set({ hasRemote: res.remotes.length > 0, remoteUrls: urls });
    } catch {
      set({ hasRemote: false, remoteUrls: [] });
    }
  },

  fetchBranchStatus: async () => {
    const { currentPath } = get();
    if (!currentPath) {
      return;
    }

    try {
      const branchStatus = await gitApi.branchStatus(currentPath);
      get().applyBranchStatus(branchStatus);
    } catch {}
  },

  fetchStashes: async () => {
    const { currentPath } = get();
    if (!currentPath) {
      return;
    }

    try {
      const res = await gitApi.stashList(currentPath);
      set({ stashes: res.stashes ?? [] });
    } catch {
      set({ stashes: [] });
    }
  },

  fetchConflicts: async () => {
    const { currentPath } = get();
    if (!currentPath) {
      return;
    }

    try {
      const res = await gitApi.conflicts(currentPath);
      set({ conflicts: res.conflicts ?? [] });
    } catch {
      set({ conflicts: [] });
    }
  },

  syncRepo: async (options = {}) => {
    const { currentPath, isRepo } = get();
    if (!currentPath || isRepo === false) {
      return;
    }

    const hasSelection =
      options.status !== undefined ||
      options.history !== undefined ||
      options.branches !== undefined ||
      options.remotes !== undefined ||
      options.branchStatus !== undefined ||
      options.stashes !== undefined ||
      options.conflicts !== undefined;

    const shouldSyncStatus = options.status ?? !hasSelection;
    const shouldSyncHistory = options.history ?? !hasSelection;
    const shouldSyncBranches = options.branches ?? !hasSelection;
    const shouldSyncRemotes = options.remotes ?? !hasSelection;
    const shouldSyncBranchStatus = options.branchStatus ?? !hasSelection;
    const shouldSyncStashes = options.stashes ?? !hasSelection;
    const shouldSyncConflicts = options.conflicts ?? !hasSelection;
    const silent = options.silent ?? false;

    if (!silent) {
      set({ isLoading: true, error: null });
    }

    const statusPromise = shouldSyncStatus ? gitApi.status(currentPath) : null;
    const logPromise = shouldSyncHistory ? gitApi.log(currentPath, Math.max(get().commits.length, 50)) : null;
    const branchesPromise = shouldSyncBranches ? gitApi.branches(currentPath) : null;
    const remotesPromise = shouldSyncRemotes ? gitApi.remotes(currentPath) : null;
    const branchStatusPromise = shouldSyncBranchStatus ? gitApi.branchStatus(currentPath) : null;
    const stashesPromise = shouldSyncStashes ? gitApi.stashList(currentPath) : null;
    const conflictsPromise = shouldSyncConflicts ? gitApi.conflicts(currentPath) : null;

    const [statusResult, logResult, branchesResult, remotesResult, branchStatusResult, stashesResult, conflictsResult] =
      await Promise.allSettled([
        statusPromise ?? Promise.resolve(null),
        logPromise ?? Promise.resolve(null),
        branchesPromise ?? Promise.resolve(null),
        remotesPromise ?? Promise.resolve(null),
        branchStatusPromise ?? Promise.resolve(null),
        stashesPromise ?? Promise.resolve(null),
        conflictsPromise ?? Promise.resolve(null),
      ]);

    if (get().currentPath !== currentPath) {
      if (!silent) {
        set({ isLoading: false });
      }
      return;
    }

    const stateUpdate: Partial<GitState> = {};

    if (shouldSyncStatus && statusResult.status === "fulfilled" && statusResult.value) {
      const nodes = statusFilesToNodes(statusResult.value.files);
      const { workingDiffs, interactiveDiffs } = get();
      stateUpdate.allFiles = nodes;
      stateUpdate.checkedFiles = getCheckedFilesForNodes(nodes);
      stateUpdate.partialSelections = {};
      stateUpdate.workingDiffs = pickWorkingDiffs(nodes, workingDiffs);
      stateUpdate.interactiveDiffs = pickInteractiveDiffs(nodes, interactiveDiffs);
    }

    if (shouldSyncHistory && logResult.status === "fulfilled" && logResult.value) {
      const commits = logResult.value.commits;
      const selectedCommitHash = get().selectedCommit?.hash ?? null;
      stateUpdate.commits = commits;
      if (selectedCommitHash) {
        const nextSelectedCommit = commits.find((commit) => commit.hash === selectedCommitHash) ?? null;
        stateUpdate.selectedCommit = nextSelectedCommit;
        if (!nextSelectedCommit) {
          stateUpdate.selectedCommitFiles = [];
        }
      }
    }

    if (shouldSyncBranches && branchesResult.status === "fulfilled" && branchesResult.value) {
      stateUpdate.branches = branchesResult.value.branches.map((branch) => branch.name);
      stateUpdate.remoteBranches = branchesResult.value.remoteBranches ?? [];
      stateUpdate.currentBranch = branchesResult.value.currentBranch;
    }

    if (shouldSyncRemotes && remotesResult.status === "fulfilled" && remotesResult.value) {
      const urls = remotesResult.value.remotes.flatMap((remote) => remote.urls);
      stateUpdate.hasRemote = remotesResult.value.remotes.length > 0;
      stateUpdate.remoteUrls = urls;
    }

    if (shouldSyncStashes && stashesResult.status === "fulfilled" && stashesResult.value) {
      stateUpdate.stashes = stashesResult.value.stashes ?? [];
    }

    if (shouldSyncConflicts && conflictsResult.status === "fulfilled" && conflictsResult.value) {
      stateUpdate.conflicts = conflictsResult.value.conflicts ?? [];
    }

    if (Object.keys(stateUpdate).length > 0) {
      set(stateUpdate);
    }

    if (shouldSyncBranchStatus && branchStatusResult.status === "fulfilled" && branchStatusResult.value) {
      get().applyBranchStatus(branchStatusResult.value);
    }

    if (!silent) {
      const firstRejected = [
        statusResult,
        logResult,
        branchesResult,
        remotesResult,
        branchStatusResult,
        stashesResult,
        conflictsResult,
      ].find((result) => result.status === "rejected");

      if (firstRejected?.status === "rejected") {
        set({
          error: firstRejected.reason instanceof Error ? firstRejected.reason.message : "Failed to sync git data",
        });
      }

      set({ isLoading: false });
    }
  },

  commitSelected: async () => {
    const { currentPath, checkedFiles, summary, description } = get();
    if (!currentPath || !summary.trim() || checkedFiles.size === 0) {
      return false;
    }

    set({ isLoading: true, error: null });

    try {
      const res = await gitApi.commitSelected(currentPath, [], [], summary, description);
      const nextSummary = getDefaultCommitSummary();

      if (res.status?.files) {
        const nodes = statusFilesToNodes(res.status.files);
        set({
          allFiles: nodes,
          checkedFiles: getCheckedFilesForNodes(nodes),
          partialSelections: {},
          workingDiffs: {},
          interactiveDiffs: {},
          commits: res.commits ?? get().commits,
          selectedCommit: null,
          selectedCommitFiles: [],
          summary: nextSummary,
          description: "",
          isAmend: false,
        });
      } else {
        set({
          checkedFiles: new Set<string>(),
          partialSelections: {},
          workingDiffs: {},
          interactiveDiffs: {},
          selectedCommit: null,
          selectedCommitFiles: [],
          summary: nextSummary,
          description: "",
          isAmend: false,
        });
        void Promise.allSettled([
          gitApi.status(currentPath),
          gitApi.log(currentPath, 50),
          gitApi.conflicts(currentPath),
          res.branchStatus ? Promise.resolve(res.branchStatus) : gitApi.branchStatus(currentPath),
        ]).then(([statusResult, logResult, conflictsResult, branchResult]) => {
          const stateUpdate: Partial<GitState> = {};

          if (statusResult.status === "fulfilled") {
            const nodes = statusFilesToNodes(statusResult.value.files);
            stateUpdate.allFiles = nodes;
            stateUpdate.checkedFiles = getCheckedFilesForNodes(nodes);
            stateUpdate.partialSelections = {};
            stateUpdate.workingDiffs = {};
            stateUpdate.interactiveDiffs = {};
          }

          if (logResult.status === "fulfilled") {
            stateUpdate.commits = logResult.value.commits;
          }

          if (conflictsResult.status === "fulfilled") {
            stateUpdate.conflicts = conflictsResult.value.conflicts ?? [];
          }

          if (Object.keys(stateUpdate).length > 0) {
            set(stateUpdate);
          }

          if (branchResult.status === "fulfilled") {
            get().applyBranchStatus(branchResult.value);
          }
        });
      }

      if (res.branchStatus) {
        get().applyBranchStatus(res.branchStatus);
      }
      return true;
    } catch (err) {
      set({ error: err instanceof Error ? err.message : "Failed to commit" });
      return false;
    } finally {
      set({ isLoading: false });
    }
  },

  amendCommit: async () => {
    const { currentPath, checkedFiles, summary, description } = get();
    if (!currentPath || !summary.trim() || checkedFiles.size === 0) {
      return false;
    }

    set({ isLoading: true, error: null });

    try {
      const res = await gitApi.amend(currentPath, [], [], summary, description);
      const nextSummary = getDefaultCommitSummary();

      if (res.status?.files) {
        const nodes = statusFilesToNodes(res.status.files);
        set({
          allFiles: nodes,
          checkedFiles: getCheckedFilesForNodes(nodes),
          partialSelections: {},
          workingDiffs: {},
          interactiveDiffs: {},
          commits: res.commits ?? get().commits,
          selectedCommit: null,
          selectedCommitFiles: [],
          summary: nextSummary,
          description: "",
          isAmend: false,
        });
      } else {
        set({
          checkedFiles: new Set<string>(),
          partialSelections: {},
          workingDiffs: {},
          interactiveDiffs: {},
          selectedCommit: null,
          selectedCommitFiles: [],
          summary: nextSummary,
          description: "",
          isAmend: false,
        });
        void Promise.allSettled([
          gitApi.status(currentPath),
          gitApi.log(currentPath, 50),
          gitApi.conflicts(currentPath),
          res.branchStatus ? Promise.resolve(res.branchStatus) : gitApi.branchStatus(currentPath),
        ]).then(([statusResult, logResult, conflictsResult, branchResult]) => {
          const stateUpdate: Partial<GitState> = {};

          if (statusResult.status === "fulfilled") {
            const nodes = statusFilesToNodes(statusResult.value.files);
            stateUpdate.allFiles = nodes;
            stateUpdate.checkedFiles = getCheckedFilesForNodes(nodes);
            stateUpdate.partialSelections = {};
            stateUpdate.workingDiffs = {};
            stateUpdate.interactiveDiffs = {};
          }

          if (logResult.status === "fulfilled") {
            stateUpdate.commits = logResult.value.commits;
          }

          if (conflictsResult.status === "fulfilled") {
            stateUpdate.conflicts = conflictsResult.value.conflicts ?? [];
          }

          if (Object.keys(stateUpdate).length > 0) {
            set(stateUpdate);
          }

          if (branchResult.status === "fulfilled") {
            get().applyBranchStatus(branchResult.value);
          }
        });
      }

      if (res.branchStatus) {
        get().applyBranchStatus(res.branchStatus);
      }
      return true;
    } catch (err) {
      set({ error: err instanceof Error ? err.message : "Failed to amend" });
      return false;
    } finally {
      set({ isLoading: false });
    }
  },

  undoLastCommit: async () => {
    const { currentPath } = get();
    if (!currentPath) {
      return false;
    }

    set({ isLoading: true, error: null });

    try {
      const res = await gitApi.undo(currentPath);
      const nodes = statusFilesToNodes(res.status.files);
      set({
        allFiles: nodes,
        checkedFiles: getCheckedFilesForNodes(nodes),
        partialSelections: {},
        workingDiffs: {},
        interactiveDiffs: {},
        commits: res.commits,
        selectedCommit: null,
        selectedCommitFiles: [],
      });
      return true;
    } catch (err) {
      set({ error: err instanceof Error ? err.message : "Failed to undo" });
      return false;
    } finally {
      set({ isLoading: false });
    }
  },

  smartSwitchBranch: async (branch) => {
    const { currentPath, fetchBranches, fetchStashes } = get();
    if (!currentPath) {
      return false;
    }

    set({ isLoading: true, error: null });

    try {
      const res = await gitApi.smartSwitchBranch(currentPath, branch);
      const nodes = statusFilesToNodes(res.status.files);
      set({
        allFiles: nodes,
        checkedFiles: getCheckedFilesForNodes(nodes),
        partialSelections: {},
        workingDiffs: {},
        interactiveDiffs: {},
        currentBranch: res.branch,
      });
      if (res.branchStatus) {
        get().applyBranchStatus(res.branchStatus);
      }
      await fetchBranches();
      await fetchStashes();
      return true;
    } catch (err) {
      set({ error: err instanceof Error ? err.message : "Failed to switch branch" });
      return false;
    } finally {
      set({ isLoading: false });
    }
  },

  createBranch: async (branch, from) => {
    const { currentPath, fetchBranches } = get();
    if (!currentPath) {
      return false;
    }

    set({ isLoading: true, error: null });

    try {
      await gitApi.createBranch(currentPath, branch, from);
      await fetchBranches();
      return true;
    } catch (err) {
      set({ error: err instanceof Error ? err.message : "Failed to create branch" });
      return false;
    } finally {
      set({ isLoading: false });
    }
  },

  deleteBranch: async (branch) => {
    const { currentPath, fetchBranches } = get();
    if (!currentPath) {
      return false;
    }

    set({ isLoading: true, error: null });

    try {
      await gitApi.deleteBranch(currentPath, branch);
      await fetchBranches();
      return true;
    } catch (err) {
      set({ error: err instanceof Error ? err.message : "Failed to delete branch" });
      return false;
    } finally {
      set({ isLoading: false });
    }
  },

  gitFetch: async () => {
    const { currentPath } = get();
    if (!currentPath) {
      return false;
    }

    set({ isLoading: true, error: null });

    try {
      const res = await gitApi.fetch(currentPath);
      if (res.branchStatus) {
        get().applyBranchStatus(res.branchStatus);
      }
      return true;
    } catch (err) {
      set({ error: err instanceof Error ? err.message : "Failed to fetch" });
      return false;
    } finally {
      set({ isLoading: false });
    }
  },

  gitPull: async () => {
    const { currentPath } = get();
    if (!currentPath) {
      return false;
    }

    set({ isLoading: true, error: null });

    try {
      const res = await gitApi.pull(currentPath);
      const nodes = statusFilesToNodes(res.status.files);
      set({
        allFiles: nodes,
        checkedFiles: getCheckedFilesForNodes(nodes),
        partialSelections: {},
        workingDiffs: {},
        interactiveDiffs: {},
        commits: res.commits,
        conflicts: res.conflicts ?? [],
      });
      if (res.branchStatus) {
        get().applyBranchStatus(res.branchStatus);
      }
      if (res.conflicts && res.conflicts.length > 0) {
        set({ activeTab: "changes" });
      }
      return true;
    } catch (err) {
      set({ error: err instanceof Error ? err.message : "Failed to pull" });
      return false;
    } finally {
      set({ isLoading: false });
    }
  },

  gitPush: async () => {
    const { currentPath } = get();
    if (!currentPath) {
      return false;
    }

    set({ isLoading: true, error: null });

    try {
      const res = await gitApi.push(currentPath);
      if (res.branchStatus) {
        get().applyBranchStatus(res.branchStatus);
      }
      return true;
    } catch (err) {
      set({ error: err instanceof Error ? err.message : "Failed to push" });
      return false;
    } finally {
      set({ isLoading: false });
    }
  },

  stash: async (message, files) => {
    const { currentPath, fetchStashes } = get();
    if (!currentPath) {
      return false;
    }

    set({ isLoading: true, error: null });

    try {
      const res = await gitApi.stash(currentPath, message, files);
      if (res.status) {
        const nodes = statusFilesToNodes(res.status.files);
        set({
          allFiles: nodes,
          checkedFiles: getCheckedFilesForNodes(nodes),
          partialSelections: {},
          workingDiffs: {},
          interactiveDiffs: {},
        });
      }
      await fetchStashes();
      return true;
    } catch (err) {
      set({ error: err instanceof Error ? err.message : "Failed to stash" });
      return false;
    } finally {
      set({ isLoading: false });
    }
  },

  stashPop: async (index = 0) => {
    const { currentPath, fetchStashes } = get();
    if (!currentPath) {
      return false;
    }

    set({ isLoading: true, error: null });

    try {
      const res = await gitApi.stashPop(currentPath, index);
      if (res.status) {
        const nodes = statusFilesToNodes(res.status.files);
        set({
          allFiles: nodes,
          checkedFiles: getCheckedFilesForNodes(nodes),
          partialSelections: {},
          workingDiffs: {},
          interactiveDiffs: {},
        });
      }
      await fetchStashes();
      return true;
    } catch (err) {
      set({ error: err instanceof Error ? err.message : "Failed to pop stash" });
      return false;
    } finally {
      set({ isLoading: false });
    }
  },

  stashDrop: async (index = 0) => {
    const { currentPath, fetchStashes } = get();
    if (!currentPath) {
      return false;
    }

    set({ isLoading: true, error: null });

    try {
      await gitApi.stashDrop(currentPath, index);
      await fetchStashes();
      return true;
    } catch (err) {
      set({ error: err instanceof Error ? err.message : "Failed to drop stash" });
      return false;
    } finally {
      set({ isLoading: false });
    }
  },

  discardFile: async (path) => {
    const { currentPath } = get();
    if (!currentPath) {
      return;
    }

    try {
      const res = await gitApi.applySelection(currentPath, path, "working", "file", "discard", "", [], []);
      const nodes = statusFilesToNodes(res.status.files);
      set((state) => ({
        allFiles: nodes,
        checkedFiles: getCheckedFilesForNodes(nodes),
        partialSelections: {},
        workingDiffs: pickWorkingDiffs(nodes, state.workingDiffs),
        interactiveDiffs: {
          ...pickInteractiveDiffs(nodes, state.interactiveDiffs),
          ...(res.diff ? { [path]: res.diff } : {}),
        },
      }));
    } catch (err) {
      set({ error: err instanceof Error ? err.message : "Failed to discard changes" });
    }
  },

  resolveConflict: async (filePath, content) => {
    const { currentPath, fetchStatus, fetchConflicts } = get();
    if (!currentPath) {
      return false;
    }

    set({ isLoading: true, error: null });

    try {
      await gitApi.resolveConflict(currentPath, filePath, content);
      await fetchStatus();
      await fetchConflicts();
      return true;
    } catch (err) {
      set({ error: err instanceof Error ? err.message : "Failed to resolve conflict" });
      return false;
    } finally {
      set({ isLoading: false });
    }
  },

  getDiff: async (filePath) => {
    const { currentPath, workingDiffs } = get();
    if (!currentPath) {
      return null;
    }

    const cached = workingDiffs[filePath];
    if (cached) {
      return cached;
    }

    try {
      const diff = await gitApi.diff(currentPath, filePath);
      set((state) => ({
        workingDiffs: {
          ...state.workingDiffs,
          [filePath]: diff,
        },
      }));
      return diff;
    } catch (err) {
      set({ error: err instanceof Error ? err.message : "Failed to get diff" });
      return null;
    }
  },

  getInteractiveDiff: async (filePath, mode = "working") => {
    const { currentPath, interactiveDiffs } = get();
    if (!currentPath) {
      return null;
    }

    const cached = interactiveDiffs[filePath];
    if (cached && cached.mode === mode) {
      return cached;
    }

    try {
      const diff = await gitApi.fileDiff(currentPath, filePath, mode);
      set((state) => ({
        interactiveDiffs: {
          ...state.interactiveDiffs,
          [filePath]: diff,
        },
      }));
      return diff;
    } catch (err) {
      set({ error: err instanceof Error ? err.message : "Failed to get interactive diff" });
      return null;
    }
  },

  applySelection: async (filePath, mode, target, action, patchHash, lineIds, hunkIds) => {
    const { currentPath } = get();
    if (!currentPath) {
      return null;
    }

    try {
      const res = await gitApi.applySelection(currentPath, filePath, mode, target, action, patchHash, lineIds, hunkIds);
      const nodes = statusFilesToNodes(res.status.files);
      set((state) => ({
        allFiles: nodes,
        checkedFiles: getCheckedFilesForNodes(nodes),
        partialSelections: {},
        workingDiffs: pickWorkingDiffs(nodes, state.workingDiffs),
        interactiveDiffs: {
          ...pickInteractiveDiffs(nodes, state.interactiveDiffs),
          ...(res.diff ? { [filePath]: res.diff } : {}),
        },
      }));
      return res.diff ?? null;
    } catch (err) {
      set({ error: err instanceof Error ? err.message : "Failed to apply selection" });
      return null;
    }
  },

  getCommitFiles: async (commitHash) => {
    const { currentPath } = get();
    if (!currentPath) {
      return [];
    }

    try {
      const res = await gitApi.commitFiles(currentPath, commitHash);
      set({ selectedCommitFiles: res.files });
      return res.files;
    } catch (err) {
      set({ error: err instanceof Error ? err.message : "Failed to get commit files" });
      return [];
    }
  },

  getCommitDiff: async (commitHash, filePath) => {
    const { currentPath } = get();
    if (!currentPath) {
      return null;
    }

    try {
      return await gitApi.commitDiff(currentPath, commitHash, filePath);
    } catch (err) {
      set({ error: err instanceof Error ? err.message : "Failed to get commit diff" });
      return null;
    }
  },

  addPatch: async (filePath, patch) => {
    const { currentPath, fetchStatus } = get();
    if (!currentPath) {
      return false;
    }

    set({ isLoading: true, error: null });

    try {
      await gitApi.addPatch(currentPath, filePath, patch);
      await fetchStatus();
      return true;
    } catch (err) {
      set({ error: err instanceof Error ? err.message : "Failed to add patch" });
      return false;
    } finally {
      set({ isLoading: false });
    }
  },
});

export const createGitStore = () => createStore<GitState>(createGitState);

export type GitStoreApi = ReturnType<typeof createGitStore>;

const gitStores = new Map<string, GitStoreApi>();

const normalizeGitStoreId = (groupId?: string) => groupId || DEFAULT_GIT_STORE_ID;

export function getOrCreateGitStore(groupId: string): GitStoreApi {
  const storeId = normalizeGitStoreId(groupId);
  const existing = gitStores.get(storeId);
  if (existing) {
    return existing;
  }
  const store = createGitStore();
  gitStores.set(storeId, store);
  return store;
}

export function removeGitStore(groupId: string): void {
  gitStores.delete(normalizeGitStoreId(groupId));
}

export function resetGitStores(): void {
  gitStores.clear();
}

export function useGitStore(): GitState;
export function useGitStore<T>(selector: GitSelector<T>): T;
export function useGitStore(groupId: string): GitState;
export function useGitStore<T>(groupId: string, selector: GitSelector<T>): T;
export function useGitStore<T>(
  groupIdOrSelector?: string | GitSelector<T>,
  maybeSelector?: GitSelector<T>
): T | GitState {
  const storeId = typeof groupIdOrSelector === "string" ? groupIdOrSelector : DEFAULT_GIT_STORE_ID;
  const selector =
    typeof groupIdOrSelector === "function" ? groupIdOrSelector : (maybeSelector ?? ((state: GitState) => state as T));
  return useStore(getOrCreateGitStore(storeId), selector);
}
