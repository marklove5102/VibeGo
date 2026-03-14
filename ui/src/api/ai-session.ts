import type { AIListResponse, AIMessagesResponse, AIOverviewResponse, AISessionConfig } from "@/types/ai-session";

const API_BASE = "/api";

async function request<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${endpoint}`, {
    headers: {
      "Content-Type": "application/json",
      ...options?.headers,
    },
    ...options,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || "Request failed");
  }
  return res.json();
}

export const aiSessionApi = {
  overview: () => request<AIOverviewResponse>("/ai-sessions/overview"),

  list: () => request<AIListResponse>("/ai-sessions"),

  rescan: () =>
    request<AIListResponse>("/ai-sessions/rescan", {
      method: "POST",
    }),

  messages: (providerId: string, sourcePath: string) =>
    request<AIMessagesResponse>("/ai-sessions/messages", {
      method: "POST",
      body: JSON.stringify({ providerId, sourcePath }),
    }),

  getConfig: () => request<AISessionConfig>("/ai-sessions/config"),

  saveConfig: (config: AISessionConfig) =>
    request<AISessionConfig>("/ai-sessions/config", {
      method: "POST",
      body: JSON.stringify(config),
    }),
};
