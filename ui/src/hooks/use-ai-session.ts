import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { aiSessionApi } from "@/api/ai-session";
import type { AISessionConfig } from "@/types/ai-session";

export const aiSessionKeys = {
  all: ["ai-sessions"] as const,
  overview: () => [...aiSessionKeys.all, "overview"] as const,
  list: () => [...aiSessionKeys.all, "list"] as const,
  config: () => [...aiSessionKeys.all, "config"] as const,
  messages: (providerId: string, sourcePath: string) =>
    [...aiSessionKeys.all, "messages", providerId, sourcePath] as const,
};

export function useAISessionOverview() {
  return useQuery({
    queryKey: aiSessionKeys.overview(),
    queryFn: () => aiSessionApi.overview(),
  });
}

export function useAISessionList() {
  return useQuery({
    queryKey: aiSessionKeys.list(),
    queryFn: () => aiSessionApi.list(),
  });
}

export function useAISessionConfig() {
  return useQuery({
    queryKey: aiSessionKeys.config(),
    queryFn: () => aiSessionApi.getConfig(),
  });
}

export function useAISessionMessages(providerId?: string, sourcePath?: string) {
  return useQuery({
    queryKey: aiSessionKeys.messages(providerId || "", sourcePath || ""),
    queryFn: () => aiSessionApi.messages(providerId || "", sourcePath || ""),
    enabled: Boolean(providerId && sourcePath),
  });
}

export function useAISessionRescan() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => aiSessionApi.rescan(),
    onSuccess: (result) => {
      queryClient.setQueryData(aiSessionKeys.list(), result);
      queryClient.invalidateQueries({ queryKey: aiSessionKeys.overview() });
      queryClient.invalidateQueries({ queryKey: aiSessionKeys.config() });
    },
  });
}

export function useAISessionSaveConfig() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (config: AISessionConfig) => aiSessionApi.saveConfig(config),
    onSuccess: (config) => {
      queryClient.setQueryData(aiSessionKeys.config(), config);
      queryClient.invalidateQueries({ queryKey: aiSessionKeys.list() });
      queryClient.invalidateQueries({ queryKey: aiSessionKeys.overview() });
    },
  });
}
