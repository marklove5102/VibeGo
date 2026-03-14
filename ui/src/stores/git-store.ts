import { useStore } from "zustand";
import { createStore, type StateCreator } from "zustand/vanilla";
import {
  type BranchStatusInfo,
  type CommitFileInfo,
  type GitCommit,
  type GitDiff,
  type GitFileStatus,
  gitApi,
  type StashEntry,
} from "@/api/git";
import { buildPatchFromSelection } from "@/lib/git-diff";
import { useSettingsStore } from "@/lib/settings";

export interface GitFileNode {
  path: string;
  name: string;
  status: "modified" | "added" | "deleted" | "renamed" | "copied" | "untracked";
}

export interface GitPartialSelection {
  selectedRowIds: string[];
}

export interface GitState {
  currentPath: string | null;
  allFiles: GitFileNode[];
  checkedFiles: Set<string>;
  partialSelections: Record<string, GitPartialSelection>;
  workingDiffs: Record<string, GitDiff>;
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
  toggleFile: (path: string) => void;
  toggleAllFiles: () => void;
  setPartialSelection: (path: string, selectedRowIds: string[], selectableRowIds: string[]) => void;
  reset: () => void;

  fetchStatus: () => Promise<void>;
  fetchLog: (limit?: number) => Promise<void>;
  fetchBranches: () => Promise<void>;
  fetchRemotes: () => Promise<void>;
  fetchBranchStatus: () => Promise<void>;
  fetchStashes: () => Promise<void>;
  fetchConflicts: () => Promise<void>;

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
  getCommitFiles: (commitHash: string) => Promise<CommitFileInfo[]>;
  getCommitDiff: (commitHash: string, filePath: string) => Promise<GitDiff | null>;
  addPatch: (filePath: string, patch: string) => Promise<boolean>;

  applyStatusUpdate: (files: GitFileStatus[]) => void;
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

const statusFilesToNodes = (files?: GitFileStatus[] | null): GitFileNode[] => {
  const map = new Map<string, GitFileNode>();
  for (const file of files ?? []) {
    if (!map.has(file.path)) {
      map.set(file.path, {
        path: file.path,
        name: file.path.split("/").pop() || file.path,
        status: mapStatus(file.status),
      });
    }
  }
  return Array.from(map.values()).sort((a, b) => a.path.localeCompare(b.path));
};

const getCheckedFilesForNodes = (nodes: GitFileNode[]) => new Set(nodes.map((node) => node.path));

const getDefaultCommitSummary = () => useSettingsStore.getState().get("gitDefaultCommitMessage");

const getValidPathSet = (nodes: GitFileNode[]) => new Set(nodes.map((node) => node.path));

const pickWorkingDiffs = (nodes: GitFileNode[], workingDiffs: Record<string, GitDiff>) => {
  const validPaths = getValidPathSet(nodes);
  return Object.fromEntries(Object.entries(workingDiffs).filter(([path]) => validPaths.has(path)));
};

const pickPartialSelections = (
  nodes: GitFileNode[],
  checkedFiles: Set<string>,
  partialSelections: Record<string, GitPartialSelection>
) => {
  const validPaths = getValidPathSet(nodes);
  return Object.fromEntries(
    Object.entries(partialSelections).filter(
      ([path, selection]) => validPaths.has(path) && checkedFiles.has(path) && selection.selectedRowIds.length > 0
    )
  );
};

const buildPartialPatches = async (
  currentPath: string,
  checkedFiles: Set<string>,
  partialSelections: Record<string, GitPartialSelection>,
  workingDiffs: Record<string, GitDiff>
) => {
  const patches: { filePath: string; patch: string }[] = [];

  for (const [filePath, selection] of Object.entries(partialSelections)) {
    if (!checkedFiles.has(filePath)) {
      continue;
    }

    const diff = workingDiffs[filePath] ?? (await gitApi.diff(currentPath, filePath));
    const patch = buildPatchFromSelection(filePath, diff.old, diff.new, selection.selectedRowIds);

    if (!patch) {
      throw new Error(`Failed to build patch for ${filePath}`);
    }

    patches.push({ filePath, patch });
  }

  return patches;
};

const createInitialGitSnapshot = () => ({
  currentPath: null as string | null,
  allFiles: [] as GitFileNode[],
  checkedFiles: new Set<string>(),
  partialSelections: {} as Record<string, GitPartialSelection>,
  workingDiffs: {} as Record<string, GitDiff>,
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

  toggleFile: (path) => {
    const { checkedFiles, partialSelections } = get();
    const nextCheckedFiles = new Set(checkedFiles);
    const nextPartialSelections = { ...partialSelections };

    if (nextCheckedFiles.has(path) || nextPartialSelections[path]) {
      nextCheckedFiles.delete(path);
      delete nextPartialSelections[path];
    } else {
      nextCheckedFiles.add(path);
    }

    set({ checkedFiles: nextCheckedFiles, partialSelections: nextPartialSelections });
  },

  toggleAllFiles: () => {
    const { allFiles, checkedFiles, partialSelections } = get();
    const allFullySelected =
      allFiles.length > 0 &&
      allFiles.every((file) => checkedFiles.has(file.path) && partialSelections[file.path] === undefined);

    if (allFullySelected) {
      set({ checkedFiles: new Set<string>(), partialSelections: {} });
      return;
    }

    set({
      checkedFiles: getCheckedFilesForNodes(allFiles),
      partialSelections: {},
    });
  },

  setPartialSelection: (path, selectedRowIds, selectableRowIds) => {
    const selectableSet = new Set(selectableRowIds);
    const uniqueSelectedRowIds = Array.from(new Set(selectedRowIds)).filter((rowId) => selectableSet.has(rowId));
    const { checkedFiles, partialSelections } = get();
    const nextCheckedFiles = new Set(checkedFiles);
    const nextPartialSelections = { ...partialSelections };

    if (uniqueSelectedRowIds.length === 0) {
      nextCheckedFiles.delete(path);
      delete nextPartialSelections[path];
    } else if (uniqueSelectedRowIds.length === selectableRowIds.length) {
      nextCheckedFiles.add(path);
      delete nextPartialSelections[path];
    } else {
      nextCheckedFiles.add(path);
      nextPartialSelections[path] = { selectedRowIds: uniqueSelectedRowIds };
    }

    set({ checkedFiles: nextCheckedFiles, partialSelections: nextPartialSelections });
  },

  reset: () => set(createInitialGitSnapshot()),

  applyStatusUpdate: (files) => {
    const nodes = statusFilesToNodes(files);
    const { allFiles, checkedFiles, partialSelections, workingDiffs } = get();
    const wasFullySelected =
      allFiles.length > 0 &&
      allFiles.every((file) => checkedFiles.has(file.path) && partialSelections[file.path] === undefined);
    const nextCheckedFiles = new Set<string>();

    for (const node of nodes) {
      if (wasFullySelected || checkedFiles.has(node.path)) {
        nextCheckedFiles.add(node.path);
      }
    }

    set({
      allFiles: nodes,
      checkedFiles: nextCheckedFiles,
      partialSelections: pickPartialSelections(nodes, nextCheckedFiles, partialSelections),
      workingDiffs: pickWorkingDiffs(nodes, workingDiffs),
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
    const { currentPath } = get();
    if (!currentPath) {
      return;
    }

    set({ isLoading: true, error: null });

    try {
      const res = await gitApi.status(currentPath);
      const nodes = statusFilesToNodes(res.files);
      set({
        allFiles: nodes,
        checkedFiles: getCheckedFilesForNodes(nodes),
        partialSelections: {},
        workingDiffs: {},
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
      set({ hasRemote: res.remotes.length > 0 });
    } catch {
      set({ hasRemote: false });
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

  commitSelected: async () => {
    const { currentPath, checkedFiles, partialSelections, workingDiffs, summary, description } = get();
    if (!currentPath || !summary.trim() || checkedFiles.size === 0) {
      return false;
    }

    set({ isLoading: true, error: null });

    try {
      const partialPaths = new Set(Object.keys(partialSelections));
      const files = Array.from(checkedFiles).filter((path) => !partialPaths.has(path));
      const patches = await buildPartialPatches(currentPath, checkedFiles, partialSelections, workingDiffs);

      if (files.length === 0 && patches.length === 0) {
        throw new Error("No selected changes to commit");
      }

      const res = await gitApi.commitSelected(currentPath, files, patches, summary, description);
      const nextSummary = getDefaultCommitSummary();

      if (res.status?.files) {
        const nodes = statusFilesToNodes(res.status.files);
        set({
          allFiles: nodes,
          checkedFiles: getCheckedFilesForNodes(nodes),
          partialSelections: {},
          workingDiffs: {},
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
    const { currentPath, checkedFiles, partialSelections, workingDiffs, summary, description } = get();
    if (!currentPath || !summary.trim() || checkedFiles.size === 0) {
      return false;
    }

    set({ isLoading: true, error: null });

    try {
      const partialPaths = new Set(Object.keys(partialSelections));
      const files = Array.from(checkedFiles).filter((path) => !partialPaths.has(path));
      const patches = await buildPartialPatches(currentPath, checkedFiles, partialSelections, workingDiffs);

      if (files.length === 0 && patches.length === 0) {
        throw new Error("No selected changes to amend");
      }

      const res = await gitApi.amend(currentPath, files, patches, summary, description);
      const nextSummary = getDefaultCommitSummary();

      if (res.status?.files) {
        const nodes = statusFilesToNodes(res.status.files);
        set({
          allFiles: nodes,
          checkedFiles: getCheckedFilesForNodes(nodes),
          partialSelections: {},
          workingDiffs: {},
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
    const { currentPath, fetchStatus } = get();
    if (!currentPath) {
      return;
    }

    try {
      await gitApi.checkout(currentPath, [path]);
      await fetchStatus();
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
