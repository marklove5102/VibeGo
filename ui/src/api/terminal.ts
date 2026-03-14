import { request } from "./request";

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
