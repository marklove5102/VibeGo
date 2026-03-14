import type { AIListResponse, AIMessagesResponse, AIOverviewResponse, AISessionConfig } from "@/types/ai-session";
import { request } from "@/api/request";

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
