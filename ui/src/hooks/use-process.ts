import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { processApi, type ProcessInfo, type SystemStats } from "@/api/process";

export const processKeys = {
  all: ["process"] as const,
  system: () => [...processKeys.all, "system"] as const,
  list: () => [...processKeys.all, "list"] as const,
  detail: (pid: number) => [...processKeys.all, "detail", pid] as const,
};

export function useSystemStats(refetchInterval?: number) {
  return useQuery<SystemStats>({
    queryKey: processKeys.system(),
    queryFn: () => processApi.systemStats(),
    refetchInterval: refetchInterval,
  });
}

export function useProcessList(refetchInterval?: number) {
  return useQuery<{ processes: ProcessInfo[] }>({
    queryKey: processKeys.list(),
    queryFn: () => processApi.list(),
    refetchInterval: refetchInterval,
  });
}

export function useProcessDetail(pid: number) {
  return useQuery<ProcessInfo>({
    queryKey: processKeys.detail(pid),
    queryFn: () => processApi.detail(pid),
    enabled: pid > 0,
  });
}

export function useProcessKill() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ pid, signal }: { pid: number; signal?: string }) => processApi.kill(pid, signal),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: processKeys.list() });
    },
  });
}
