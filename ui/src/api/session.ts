import { request } from "./request";

export interface SessionInfo {
  id: string;
  user_id: string;
  name: string;
  created_at: number;
  updated_at: number;
}

export interface SessionDetail {
  id: string;
  user_id: string;
  name: string;
  state: string;
  created_at: number;
  updated_at: number;
}

export const sessionApi = {
  list: (page = 1, pageSize = 50) =>
    request<{
      sessions: SessionInfo[];
      page: number;
      page_size: number;
      total: number;
    }>(`/session?page=${page}&page_size=${pageSize}`),

  create: (name: string) =>
    request<{ ok: boolean; id: string }>("/session", {
      method: "POST",
      body: JSON.stringify({ name }),
    }),

  get: (id: string) => request<SessionDetail>(`/session/${id}`),

  update: (id: string, data: { name?: string; state?: string }) =>
    request<{ ok: boolean }>(`/session/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),

  delete: (id: string) =>
    request<{ ok: boolean }>(`/session/${id}`, {
      method: "DELETE",
    }),
};
