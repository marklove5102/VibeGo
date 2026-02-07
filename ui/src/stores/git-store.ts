import { create } from "zustand";
import {
  type BranchStatusInfo,
  type CommitFileInfo,
  type GitCommit,
  type GitDiff,
  type GitFileStatus,
  gitApi,
  type StashEntry,
} from "@/api/git";

export interface GitFileNode {
  path: string;
  name: string;
  status: "modified" | "added" | "deleted" | "renamed" | "copied" | "untracked";
}

interface GitState {
  currentPath: string | null;
  allFiles: GitFileNode[];
  checkedFiles: Set<string>;
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
  lastCommitHash: string | null;
  showPostCommit: boolean;
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
  dismissPostCommit: () => void;
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

const statusFilesToNodes = (files: GitFileStatus[]): GitFileNode[] => {
  const map = new Map<string, GitFileNode>();
  for (const f of files) {
    if (!map.has(f.path)) {
      map.set(f.path, {
        path: f.path,
        name: f.path.split("/").pop() || f.path,
        status: mapStatus(f.status),
      });
    }
  }
  return Array.from(map.values()).sort((a, b) => a.path.localeCompare(b.path));
};

export const useGitStore = create<GitState>((set, get) => ({
  currentPath: null,
  allFiles: [],
  checkedFiles: new Set<string>(),
  summary: "",
  description: "",
  isAmend: false,
  currentBranch: "main",
  branches: [],
  remoteBranches: [],
  aheadCount: 0,
  behindCount: 0,
  upstreamBranch: null,
  hasRemote: false,
  commits: [],
  selectedCommit: null,
  selectedCommitFiles: [],
  activeTab: "changes",
  stashes: [],
  conflicts: [],
  lastCommitHash: null,
  showPostCommit: false,
  isLoading: false,
  error: null,

  setCurrentPath: (path) => set({ currentPath: path }),
  setSummary: (s) => set({ summary: s }),
  setDescription: (d) => set({ description: d }),
  setIsAmend: (v) => set({ isAmend: v }),
  setActiveTab: (tab) => set({ activeTab: tab }),
  setSelectedCommit: (c) => set({ selectedCommit: c }),
  dismissPostCommit: () => set({ showPostCommit: false }),

  toggleFile: (path) => {
    const { checkedFiles } = get();
    const next = new Set(checkedFiles);
    if (next.has(path)) {
      next.delete(path);
    } else {
      next.add(path);
    }
    set({ checkedFiles: next });
  },

  toggleAllFiles: () => {
    const { allFiles, checkedFiles } = get();
    const allChecked = allFiles.length > 0 && allFiles.every((f) => checkedFiles.has(f.path));
    if (allChecked) {
      set({ checkedFiles: new Set() });
    } else {
      set({ checkedFiles: new Set(allFiles.map((f) => f.path)) });
    }
  },

  reset: () =>
    set({
      allFiles: [],
      checkedFiles: new Set(),
      summary: "",
      description: "",
      isAmend: false,
      commits: [],
      selectedCommit: null,
      selectedCommitFiles: [],
      isLoading: false,
      error: null,
      aheadCount: 0,
      behindCount: 0,
      upstreamBranch: null,
      hasRemote: false,
      stashes: [],
      conflicts: [],
      lastCommitHash: null,
      showPostCommit: false,
    }),

  applyStatusUpdate: (files) => {
    const nodes = statusFilesToNodes(files);
    const { checkedFiles: oldChecked } = get();
    const newChecked = new Set<string>();
    for (const n of nodes) {
      if (oldChecked.size === 0 || oldChecked.has(n.path)) {
        newChecked.add(n.path);
      }
    }
    set({ allFiles: nodes, checkedFiles: newChecked });
  },

  applyBranchStatus: (bs) => {
    set({
      currentBranch: bs.branch || get().currentBranch,
      upstreamBranch: bs.upstream || null,
      aheadCount: bs.ahead || 0,
      behindCount: bs.behind || 0,
    });
  },

  fetchStatus: async () => {
    const { currentPath } = get();
    if (!currentPath) return;
    set({ isLoading: true, error: null });
    try {
      const res = await gitApi.status(currentPath);
      const nodes = statusFilesToNodes(res.files);
      set({ allFiles: nodes, checkedFiles: new Set(nodes.map((n) => n.path)) });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : "Failed to fetch status" });
    } finally {
      set({ isLoading: false });
    }
  },

  fetchLog: async (limit = 50) => {
    const { currentPath } = get();
    if (!currentPath) return;
    try {
      const res = await gitApi.log(currentPath, limit);
      set({ commits: res.commits });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : "Failed to fetch log" });
    }
  },

  fetchBranches: async () => {
    const { currentPath } = get();
    if (!currentPath) return;
    try {
      const res = await gitApi.branches(currentPath);
      set({
        branches: res.branches.map((b) => b.name),
        remoteBranches: res.remoteBranches ?? [],
        currentBranch: res.currentBranch,
      });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : "Failed to fetch branches" });
    }
  },

  fetchRemotes: async () => {
    const { currentPath } = get();
    if (!currentPath) return;
    try {
      const res = await gitApi.remotes(currentPath);
      set({ hasRemote: res.remotes.length > 0 });
    } catch {
      set({ hasRemote: false });
    }
  },

  fetchBranchStatus: async () => {
    const { currentPath } = get();
    if (!currentPath) return;
    try {
      const bs = await gitApi.branchStatus(currentPath);
      get().applyBranchStatus(bs);
    } catch {}
  },

  fetchStashes: async () => {
    const { currentPath } = get();
    if (!currentPath) return;
    try {
      const res = await gitApi.stashList(currentPath);
      set({ stashes: res.stashes ?? [] });
    } catch {
      set({ stashes: [] });
    }
  },

  fetchConflicts: async () => {
    const { currentPath } = get();
    if (!currentPath) return;
    try {
      const res = await gitApi.conflicts(currentPath);
      set({ conflicts: res.conflicts ?? [] });
    } catch {
      set({ conflicts: [] });
    }
  },

  commitSelected: async () => {
    const { currentPath, checkedFiles, summary, description } = get();
    if (!currentPath || !summary.trim() || checkedFiles.size === 0) return false;
    set({ isLoading: true, error: null });
    try {
      const res = await gitApi.commitSelected(currentPath, Array.from(checkedFiles), summary, description);
      const nodes = statusFilesToNodes(res.status.files);
      set({
        allFiles: nodes,
        checkedFiles: new Set(nodes.map((n) => n.path)),
        commits: res.commits,
        summary: "",
        description: "",
        isAmend: false,
        lastCommitHash: res.hash,
        showPostCommit: true,
      });
      if (res.branchStatus) get().applyBranchStatus(res.branchStatus);
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
    if (!currentPath || !summary.trim() || checkedFiles.size === 0) return false;
    set({ isLoading: true, error: null });
    try {
      const res = await gitApi.amend(currentPath, Array.from(checkedFiles), summary, description);
      const nodes = statusFilesToNodes(res.status.files);
      set({
        allFiles: nodes,
        checkedFiles: new Set(nodes.map((n) => n.path)),
        commits: res.commits,
        summary: "",
        description: "",
        isAmend: false,
        showPostCommit: false,
      });
      if (res.branchStatus) get().applyBranchStatus(res.branchStatus);
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
    if (!currentPath) return false;
    set({ isLoading: true, error: null });
    try {
      const res = await gitApi.undo(currentPath);
      const nodes = statusFilesToNodes(res.status.files);
      set({
        allFiles: nodes,
        checkedFiles: new Set(nodes.map((n) => n.path)),
        commits: res.commits,
        showPostCommit: false,
        lastCommitHash: null,
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
    if (!currentPath) return false;
    set({ isLoading: true, error: null });
    try {
      const res = await gitApi.smartSwitchBranch(currentPath, branch);
      const nodes = statusFilesToNodes(res.status.files);
      set({
        allFiles: nodes,
        checkedFiles: new Set(nodes.map((n) => n.path)),
        currentBranch: res.branch,
      });
      if (res.branchStatus) get().applyBranchStatus(res.branchStatus);
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
    if (!currentPath) return false;
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
    if (!currentPath) return false;
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
    if (!currentPath) return false;
    set({ isLoading: true, error: null });
    try {
      const res = await gitApi.fetch(currentPath);
      if (res.branchStatus) get().applyBranchStatus(res.branchStatus);
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
    if (!currentPath) return false;
    set({ isLoading: true, error: null });
    try {
      const res = await gitApi.pull(currentPath);
      const nodes = statusFilesToNodes(res.status.files);
      set({
        allFiles: nodes,
        checkedFiles: new Set(nodes.map((n) => n.path)),
        commits: res.commits,
        conflicts: res.conflicts ?? [],
      });
      if (res.branchStatus) get().applyBranchStatus(res.branchStatus);
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
    if (!currentPath) return false;
    set({ isLoading: true, error: null });
    try {
      const res = await gitApi.push(currentPath);
      if (res.branchStatus) get().applyBranchStatus(res.branchStatus);
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
    if (!currentPath) return false;
    set({ isLoading: true, error: null });
    try {
      const res = await gitApi.stash(currentPath, message, files);
      if (res.status) {
        const nodes = statusFilesToNodes(res.status.files);
        set({ allFiles: nodes, checkedFiles: new Set(nodes.map((n) => n.path)) });
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
    if (!currentPath) return false;
    set({ isLoading: true, error: null });
    try {
      const res = await gitApi.stashPop(currentPath, index);
      if (res.status) {
        const nodes = statusFilesToNodes(res.status.files);
        set({ allFiles: nodes, checkedFiles: new Set(nodes.map((n) => n.path)) });
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
    if (!currentPath) return false;
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
    if (!currentPath) return;
    try {
      await gitApi.checkout(currentPath, [path]);
      await fetchStatus();
    } catch (err) {
      set({ error: err instanceof Error ? err.message : "Failed to discard changes" });
    }
  },

  resolveConflict: async (filePath, content) => {
    const { currentPath, fetchStatus, fetchConflicts } = get();
    if (!currentPath) return false;
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
    const { currentPath } = get();
    if (!currentPath) return null;
    try {
      return await gitApi.diff(currentPath, filePath);
    } catch (err) {
      set({ error: err instanceof Error ? err.message : "Failed to get diff" });
      return null;
    }
  },

  getCommitFiles: async (commitHash) => {
    const { currentPath } = get();
    if (!currentPath) return [];
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
    if (!currentPath) return null;
    try {
      return await gitApi.commitDiff(currentPath, commitHash, filePath);
    } catch (err) {
      set({ error: err instanceof Error ? err.message : "Failed to get commit diff" });
      return null;
    }
  },

  addPatch: async (filePath, patch) => {
    const { currentPath, fetchStatus } = get();
    if (!currentPath) return false;
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
}));
