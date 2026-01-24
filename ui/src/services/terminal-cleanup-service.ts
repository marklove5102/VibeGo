import { terminalApi } from "@/api/terminal";
import { useFrameStore } from "@/stores/frame-store";
import { useTerminalStore } from "@/stores/terminal-store";

let previousGroupIds: Set<string> = new Set();
let unsubscribe: (() => void) | null = null;

export function initTerminalCleanup(): void {
  if (unsubscribe) return;

  previousGroupIds = new Set(useFrameStore.getState().groups.map((g) => g.id));

  unsubscribe = useFrameStore.subscribe((state) => {
    const currentGroupIds = new Set(state.groups.map((g) => g.id));
    const removedGroupIds = [...previousGroupIds].filter((id) => !currentGroupIds.has(id));

    for (const groupId of removedGroupIds) {
      cleanupGroupTerminals(groupId);
    }

    previousGroupIds = currentGroupIds;
  });
}

export function cleanupGroupTerminals(groupId: string): void {
  const terminalState = useTerminalStore.getState();
  const terminals = terminalState.terminalsByGroup[groupId] || [];

  for (const terminal of terminals) {
    terminalApi.close(terminal.id).catch(() => {});
  }

  terminalState.clearGroupData(groupId);
}

export async function cleanupAllTerminals(): Promise<void> {
  const terminalState = useTerminalStore.getState();
  const allTerminalIds: string[] = [];

  for (const terminals of Object.values(terminalState.terminalsByGroup)) {
    allTerminalIds.push(...terminals.map((t) => t.id));
  }

  await Promise.all(allTerminalIds.map((id) => terminalApi.close(id).catch(() => {})));
  terminalState.reset();
}

export function destroyTerminalCleanup(): void {
  if (unsubscribe) {
    unsubscribe();
    unsubscribe = null;
  }
}
