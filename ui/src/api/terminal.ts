import { request } from "@/api/request";

export type TerminalStatus = "running" | "exited" | "closed";

export interface TerminalInfo {
  id: string;
  name: string;
  shell: string;
  cwd: string;
  cols: number;
  rows: number;
  status: TerminalStatus;
  workspace_session_id: string;
  group_id: string;
  parent_id: string;
  exit_code: number;
  history_size: number;
  created_at: number;
  updated_at: number;
}

export const terminalApi = {
  list: (opts?: { workspace_session_id?: string; group_id?: string }) => {
    const params = new URLSearchParams();
    if (opts?.workspace_session_id) {
      params.set("workspace_session_id", opts.workspace_session_id);
    }
    if (opts?.group_id) {
      params.set("group_id", opts.group_id);
    }
    const qs = params.toString();
    return request<{ terminals: TerminalInfo[] }>(`/terminal${qs ? `?${qs}` : ""}`);
  },

  create: (opts?: {
    name?: string;
    cwd?: string;
    cols?: number;
    rows?: number;
    workspace_session_id?: string;
    group_id?: string;
    parent_id?: string;
  }) =>
    request<{ ok: boolean; id: string; name: string }>("/terminal", {
      method: "POST",
      body: JSON.stringify(opts || {}),
    }),

  syncWorkspace: (
    workspaceSessionId: string,
    terminals: Array<{ id: string; group_id: string; parent_id?: string }>,
    workspaceState?: {
      terminalsByGroup: Record<string, Array<{ id: string; name: string; pinned?: boolean; status?: TerminalStatus; parentId?: string }>>;
      activeTerminalByGroup: Record<string, string | null>;
      listManagerOpenByGroup: Record<string, boolean>;
      terminalLayouts: Record<string, unknown>;
      focusedIdByGroup: Record<string, string | null>;
    }
  ) =>
    request<{ ok: boolean }>("/terminal/sync-workspace", {
      method: "POST",
      body: JSON.stringify({
        workspace_session_id: workspaceSessionId,
        terminals,
        workspace_state: workspaceState,
      }),
    }),

  rename: (id: string, name: string) =>
    request<{ ok: boolean }>("/terminal/rename", {
      method: "POST",
      body: JSON.stringify({ id, name }),
    }),

  close: (id: string) =>
    request<{ ok: boolean }>("/terminal/close", {
      method: "POST",
      body: JSON.stringify({ id }),
    }),

  delete: (id: string) =>
    request<{ ok: boolean }>("/terminal/delete", {
      method: "POST",
      body: JSON.stringify({ id }),
    }),

  deleteBatch: (ids: string[]) =>
    request<{ ok: boolean; deleted: number }>("/terminal/delete-batch", {
      method: "POST",
      body: JSON.stringify({ ids }),
    }),

  wsUrl: (id: string, cursor?: number) => {
    const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
    const key = localStorage.getItem("vibego_auth_key");
    const params = new URLSearchParams();
    if (cursor !== undefined && cursor > 0) params.set("cursor", String(cursor));
    if (key) params.set("key", key);
    const qs = params.toString();
    return `${proto}//${window.location.host}/api/terminal/ws/${id}${qs ? `?${qs}` : ""}`;
  },
};
