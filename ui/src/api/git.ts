const API_BASE = "/api";

async function request<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${endpoint}`, {
    headers: { "Content-Type": "application/json", ...options?.headers },
    ...options,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || "Request failed");
  }
  return res.json();
}

export interface GitFileStatus {
  path: string;
  status: string;
  staged: boolean;
}

export interface GitCommit {
  hash: string;
  message: string;
  author: string;
  date: string;
}

export interface GitDiff {
  path: string;
  old: string;
  new: string;
}

export interface GitStructuredFile {
  path: string;
  name: string;
  indexStatus: string;
  worktreeStatus: string;
  changeType: string;
  includedState: "none" | "partial" | "all";
  conflicted: boolean;
}

export interface GitStatusSummary {
  changed: number;
  staged: number;
  unstaged: number;
  included: number;
  conflicted: number;
}

export interface GitStructuredStatus {
  files: GitStructuredFile[];
  summary: GitStatusSummary;
}

export interface GitDiffLine {
  kind: "context" | "add" | "del";
  content: string;
  oldLine: number;
  newLine: number;
}

export interface GitDiffHunk {
  id: string;
  header: string;
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  lines: GitDiffLine[];
  patch: string;
}

export interface GitInteractiveDiff {
  path: string;
  mode: "working" | "staged" | "stash";
  patch: string;
  patchHash: string;
  hunks: GitDiffHunk[];
  old: string;
  new: string;
  binary: boolean;
}

export interface GitDiffLineV2 {
  id: string;
  kind: "context" | "add" | "del";
  content: string;
  oldLine: number;
  newLine: number;
  selectable: boolean;
}

export interface GitDiffHunkV2 {
  id: string;
  header: string;
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  lines: GitDiffLineV2[];
  patch: string;
}

export interface GitDiffStatsV2 {
  added: number;
  deleted: number;
  hunks: number;
  lines: number;
}

export interface GitDiffCapabilityV2 {
  lineSelectable: boolean;
}

export interface GitInteractiveDiffV2 {
  path: string;
  mode: "working" | "staged";
  patch: string;
  patchHash: string;
  hunks: GitDiffHunkV2[];
  stats: GitDiffStatsV2;
  capability: GitDiffCapabilityV2;
  old: string;
  new: string;
  binary: boolean;
}

export interface GitApplySelectionV2Response {
  ok: boolean;
  status: GitStructuredStatus;
  diff?: GitInteractiveDiffV2;
}

export interface GitStashFile {
  path: string;
  status: "modified" | "added" | "deleted" | "renamed" | "copied";
}

export interface GitConflictDetails {
  path: string;
  content: string;
  ours: string;
  base: string;
  theirs: string;
}

export interface GitConflictSegmentV2 {
  type: "plain" | "conflict";
  text?: string;
  blockId?: string;
  ours?: string[];
  base?: string[];
  theirs?: string[];
}

export interface GitConflictDetailsV2 {
  path: string;
  hash: string;
  segments: GitConflictSegmentV2[];
  blocksTotal: number;
}

export interface CommitFileInfo {
  path: string;
  status: string;
}

export interface RemoteInfo {
  name: string;
  urls: string[];
}

export interface StashEntry {
  index: number;
  message: string;
}

export interface BranchStatusInfo {
  branch: string;
  upstream: string;
  ahead: number;
  behind: number;
}

export interface BranchInfo {
  name: string;
  isCurrent: boolean;
}

export interface StatusPayload {
  files: GitFileStatus[];
}

export interface CommitSelectedResponse {
  ok: boolean;
  hash: string;
  status: StatusPayload;
  commits: GitCommit[];
  branchStatus: BranchStatusInfo;
}

export interface PullResponse {
  ok: boolean;
  status: StatusPayload;
  commits: GitCommit[];
  conflicts: string[];
  branchStatus: BranchStatusInfo;
}

export interface SmartSwitchResponse {
  ok: boolean;
  branch: string;
  stashed: boolean;
  stashConflict: boolean;
  status: StatusPayload;
  branchStatus: BranchStatusInfo;
}

export type GitWSEventType = "file_changed" | "remote_updated" | "push_progress" | "pull_progress" | "operation_done";

export interface GitWSEvent {
  type: GitWSEventType;
  data: Record<string, unknown>;
}

export const gitApi = {
  init: (path: string) =>
    request<{ ok: boolean }>("/git/init", {
      method: "POST",
      body: JSON.stringify({ path }),
    }),

  clone: (url: string, path: string) =>
    request<{ ok: boolean }>("/git/clone", {
      method: "POST",
      body: JSON.stringify({ url, path }),
    }),

  status: (path: string) =>
    request<{ files: GitFileStatus[] }>("/git/status", {
      method: "POST",
      body: JSON.stringify({ path }),
    }),

  statusV2: (path: string) =>
    request<GitStructuredStatus>("/git/status-v2", {
      method: "POST",
      body: JSON.stringify({ path }),
    }),

  log: (path: string, limit = 20) =>
    request<{ commits: GitCommit[] }>("/git/log", {
      method: "POST",
      body: JSON.stringify({ path, limit }),
    }),

  diff: (path: string, filePath: string) =>
    request<GitDiff>("/git/diff", {
      method: "POST",
      body: JSON.stringify({ path, filePath }),
    }),

  fileDiff: (path: string, filePath: string, mode: "working" | "staged" = "working") =>
    request<GitInteractiveDiff>("/git/file-diff", {
      method: "POST",
      body: JSON.stringify({ path, filePath, mode }),
    }),

  fileDiffV2: (path: string, filePath: string, mode: "working" | "staged" = "working") =>
    request<GitInteractiveDiffV2>("/git/file-diff-v2", {
      method: "POST",
      body: JSON.stringify({ path, filePath, mode }),
    }),

  changeSelection: (
    path: string,
    filePath: string,
    mode: "working" | "staged",
    action: "include" | "exclude" | "discard",
    patchHash: string,
    hunkIds: string[]
  ) =>
    request<{ ok: boolean; status: GitStructuredStatus; diff?: GitInteractiveDiff }>("/git/change-selection", {
      method: "POST",
      body: JSON.stringify({ path, filePath, mode, action, patchHash, hunkIds }),
    }),

  applySelectionV2: (
    path: string,
    filePath: string,
    mode: "working" | "staged",
    target: "line" | "hunk" | "file",
    action: "include" | "exclude" | "discard",
    patchHash: string,
    lineIds: string[],
    hunkIds: string[]
  ) =>
    request<GitApplySelectionV2Response>("/git/apply-selection-v2", {
      method: "POST",
      body: JSON.stringify({ path, filePath, mode, target, action, patchHash, lineIds, hunkIds }),
    }),

  show: (path: string, filePath: string, ref = "HEAD") =>
    request<{ content: string }>("/git/show", {
      method: "POST",
      body: JSON.stringify({ path, filePath, ref }),
    }),

  add: (path: string, files: string[]) =>
    request<{ ok: boolean }>("/git/add", {
      method: "POST",
      body: JSON.stringify({ path, files }),
    }),

  reset: (path: string, files?: string[]) =>
    request<{ ok: boolean }>("/git/reset", {
      method: "POST",
      body: JSON.stringify({ path, files }),
    }),

  checkout: (path: string, files: string[]) =>
    request<{ ok: boolean; status: StatusPayload }>("/git/checkout", {
      method: "POST",
      body: JSON.stringify({ path, files }),
    }),

  commit: (path: string, message: string, author?: string, email?: string) =>
    request<{ ok: boolean; hash: string }>("/git/commit", {
      method: "POST",
      body: JSON.stringify({ path, message, author, email }),
    }),

  commitSelected: (path: string, files: string[], summary: string, description?: string) =>
    request<CommitSelectedResponse>("/git/commit-selected", {
      method: "POST",
      body: JSON.stringify({ path, files, summary, description }),
    }),

  amend: (path: string, files: string[], summary: string, description?: string) =>
    request<CommitSelectedResponse>("/git/amend", {
      method: "POST",
      body: JSON.stringify({ path, files, summary, description }),
    }),

  undo: (path: string) =>
    request<{ ok: boolean; status: StatusPayload; commits: GitCommit[] }>("/git/undo", {
      method: "POST",
      body: JSON.stringify({ path }),
    }),

  branches: (path: string) =>
    request<{
      branches: BranchInfo[];
      remoteBranches: string[];
      currentBranch: string;
    }>("/git/branches", {
      method: "POST",
      body: JSON.stringify({ path }),
    }),

  branchStatus: (path: string) =>
    request<BranchStatusInfo>("/git/branch-status", {
      method: "POST",
      body: JSON.stringify({ path }),
    }),

  switchBranch: (path: string, branch: string) =>
    request<{ ok: boolean; branch: string }>("/git/switch-branch", {
      method: "POST",
      body: JSON.stringify({ path, branch }),
    }),

  smartSwitchBranch: (path: string, branch: string) =>
    request<SmartSwitchResponse>("/git/smart-switch-branch", {
      method: "POST",
      body: JSON.stringify({ path, branch }),
    }),

  commitFiles: (path: string, commit: string) =>
    request<{ files: CommitFileInfo[] }>("/git/commit-files", {
      method: "POST",
      body: JSON.stringify({ path, commit }),
    }),

  commitDiff: (path: string, commit: string, filePath: string) =>
    request<GitDiff>("/git/commit-diff", {
      method: "POST",
      body: JSON.stringify({ path, commit, filePath }),
    }),

  remotes: (path: string) =>
    request<{ remotes: RemoteInfo[] }>("/git/remotes", {
      method: "POST",
      body: JSON.stringify({ path }),
    }),

  fetch: (path: string, remote = "origin") =>
    request<{ ok: boolean; branchStatus: BranchStatusInfo }>("/git/fetch", {
      method: "POST",
      body: JSON.stringify({ path, remote }),
    }),

  pull: (path: string, remote = "origin", branch?: string) =>
    request<PullResponse>("/git/pull", {
      method: "POST",
      body: JSON.stringify({ path, remote, branch }),
    }),

  push: (path: string, remote = "origin") =>
    request<{ ok: boolean; branchStatus: BranchStatusInfo }>("/git/push", {
      method: "POST",
      body: JSON.stringify({ path, remote }),
    }),

  stash: (path: string, message?: string, files?: string[]) =>
    request<{ ok: boolean; message: string; status: StatusPayload }>("/git/stash", {
      method: "POST",
      body: JSON.stringify({ path, message, files }),
    }),

  stashList: (path: string) =>
    request<{ stashes: StashEntry[] }>("/git/stash-list", {
      method: "POST",
      body: JSON.stringify({ path }),
    }),

  stashFiles: (path: string, index: number) =>
    request<{ files: GitStashFile[] }>("/git/stash-files", {
      method: "POST",
      body: JSON.stringify({ path, index }),
    }),

  stashDiff: (path: string, index: number, filePath: string) =>
    request<GitInteractiveDiff>("/git/stash-diff", {
      method: "POST",
      body: JSON.stringify({ path, index, filePath }),
    }),

  stashPop: (path: string, index = 0) =>
    request<{ ok: boolean; status: StatusPayload }>("/git/stash-pop", {
      method: "POST",
      body: JSON.stringify({ path, index }),
    }),

  stashDrop: (path: string, index = 0) =>
    request<{ ok: boolean }>("/git/stash-drop", {
      method: "POST",
      body: JSON.stringify({ path, index }),
    }),

  conflicts: (path: string) =>
    request<{ conflicts: string[] }>("/git/conflicts", {
      method: "POST",
      body: JSON.stringify({ path }),
    }),

  resolveConflict: (path: string, filePath: string, content: string) =>
    request<{ ok: boolean }>("/git/resolve-conflict", {
      method: "POST",
      body: JSON.stringify({ path, filePath, content }),
    }),

  conflictDetails: (path: string, filePath: string) =>
    request<GitConflictDetails>("/git/conflict-details", {
      method: "POST",
      body: JSON.stringify({ path, filePath }),
    }),

  conflictDetailsV2: (path: string, filePath: string) =>
    request<GitConflictDetailsV2>("/git/conflict-details-v2", {
      method: "POST",
      body: JSON.stringify({ path, filePath }),
    }),

  conflictResolve: (path: string, filePath: string, mode: "ours" | "theirs" | "manual", content?: string) =>
    request<{ ok: boolean; conflicts: string[] }>("/git/conflict-resolve", {
      method: "POST",
      body: JSON.stringify({ path, filePath, mode, content }),
    }),

  conflictResolveV2: (
    path: string,
    filePath: string,
    mode: "line-map" | "manual" | "ours" | "theirs",
    hash: string,
    resolvedContent?: string,
    manualContent?: string
  ) =>
    request<{ ok: boolean; conflicts: string[]; status: GitStructuredStatus }>("/git/conflict-resolve-v2", {
      method: "POST",
      body: JSON.stringify({ path, filePath, mode, hash, resolvedContent, manualContent }),
    }),

  createBranch: (path: string, branch: string, from?: string) =>
    request<{ ok: boolean; branch: string }>("/git/create-branch", {
      method: "POST",
      body: JSON.stringify({ path, branch, from }),
    }),

  deleteBranch: (path: string, branch: string) =>
    request<{ ok: boolean }>("/git/delete-branch", {
      method: "POST",
      body: JSON.stringify({ path, branch }),
    }),

  addPatch: (path: string, filePath: string, patch: string) =>
    request<{ ok: boolean }>("/git/add-patch", {
      method: "POST",
      body: JSON.stringify({ path, filePath, patch }),
    }),

  connectWs: (path: string, onEvent: (event: GitWSEvent) => void): (() => void) => {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const host = window.location.host;
    const url = `${protocol}//${host}${API_BASE}/git/ws?path=${encodeURIComponent(path)}`;
    let ws: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let closed = false;
    let attempt = 0;

    const connect = () => {
      if (closed) return;
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
      ws = new WebSocket(url);
      ws.onopen = () => {
        attempt = 0;
      };
      ws.onmessage = (e) => {
        try {
          const event = JSON.parse(e.data) as GitWSEvent;
          onEvent(event);
        } catch {}
      };
      ws.onclose = () => {
        if (!closed) {
          const baseDelay = 400;
          const maxDelay = 10_000;
          const delay = Math.min(maxDelay, baseDelay * Math.pow(2, attempt)) + Math.floor(Math.random() * 250);
          attempt++;
          reconnectTimer = setTimeout(connect, delay);
        }
      };
      ws.onerror = () => ws?.close();
    };

    connect();

    return () => {
      closed = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      ws?.close();
    };
  },
};
