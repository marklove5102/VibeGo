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

    const connect = () => {
      if (closed) return;
      ws = new WebSocket(url);
      ws.onmessage = (e) => {
        try {
          const event = JSON.parse(e.data) as GitWSEvent;
          onEvent(event);
        } catch {}
      };
      ws.onclose = () => {
        if (!closed) {
          reconnectTimer = setTimeout(connect, 3000);
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
