import { create } from "zustand";
import { fileApi } from "../api/file";
import { type SessionInfo, sessionApi } from "../api/session";
import { terminalApi } from "../api/terminal";
import { cleanupAllTerminals } from "../services/terminal-cleanup-service";
import {
  type FileManagerState,
  getOrCreateFileManagerStore,
  removeFileManagerStore,
  resetFileManagerStores,
} from "./file-manager-store";
import { type GenericGroup, type GroupPage, type ToolGroup, useFrameStore } from "./frame-store";
import * as gitStoreModule from "./git-store";
import { type LayoutNode, type TerminalSession, useTerminalStore } from "./terminal-store";

const CURRENT_SESSION_KEY = "current_session_id";
const SESSION_STATE_BACKUP_KEY_PREFIX = "session_state_backup:";

let autoSaveUnsub: (() => void) | null = null;
let autoSaveTimer: ReturnType<typeof setTimeout> | null = null;

export interface SessionState {
  openGroups: Array<{
    id: string;
    name: string;
    pages: GroupPage[];
    activePageId: string | null;
  }>;
  openTools: Array<{
    id: string;
    pageId: string;
    name: string;
  }>;
  terminalsByGroup: Record<string, TerminalSession[]>;
  activeTerminalByGroup: Record<string, string | null>;
  listManagerOpenByGroup: Record<string, boolean>;
  terminalLayouts: Record<string, LayoutNode>;
  focusedIdByGroup: Record<string, string | null>;
  settingsOpen: boolean;
  activeGroupId: string | null;
  fileManagerByGroup: Record<
    string,
    {
      currentPath: string;
      rootPath: string;
      pathHistory: string[];
      historyIndex: number;
    }
  >;
}

interface SessionStoreState {
  currentSessionId: string | null;
  sessions: SessionInfo[];
  loading: boolean;
  error: string | null;

  loadSessions: () => Promise<void>;
  initSession: () => Promise<boolean>;
  createSession: (name: string) => Promise<string>;
  openFolder: (folderPath: string) => Promise<string>;
  createSessionFromFolder: (folderPath: string) => Promise<string>;
  closeFolderGroup: (groupId: string) => Promise<void>;
  switchSession: (id: string) => Promise<void>;
  saveCurrentSession: () => Promise<void>;
  deleteSession: (id: string) => Promise<void>;
  clearAllSessions: () => Promise<void>;
  renameSession: (id: string, name: string) => Promise<void>;
  getCurrentSessionId: () => string | null;
  setCurrentSessionId: (id: string | null) => void;
  initAutoSave: () => void;
}

function getStoredSessionId(): string | null {
  return localStorage.getItem(CURRENT_SESSION_KEY);
}

function setStoredSessionId(id: string | null): void {
  if (id) {
    localStorage.setItem(CURRENT_SESSION_KEY, id);
  } else {
    localStorage.removeItem(CURRENT_SESSION_KEY);
  }
}

function createEmptySessionState(): SessionState {
  return {
    openGroups: [],
    openTools: [],
    terminalsByGroup: {},
    activeTerminalByGroup: {},
    listManagerOpenByGroup: {},
    terminalLayouts: {},
    focusedIdByGroup: {},
    settingsOpen: false,
    activeGroupId: null,
    fileManagerByGroup: {},
  };
}

function hasRestorableSessionContent(state: SessionState): boolean {
  return state.openGroups.length > 0 || state.openTools.length > 0 || state.settingsOpen;
}

function getSessionStateBackupKey(id: string): string {
  return `${SESSION_STATE_BACKUP_KEY_PREFIX}${id}`;
}

function getStoredSessionStateBackup(id: string): SessionState | null {
  const raw = localStorage.getItem(getSessionStateBackupKey(id));
  if (!raw) {
    return null;
  }

  try {
    const state = parseSessionState(raw);
    return hasRestorableSessionContent(state) ? state : null;
  } catch {
    localStorage.removeItem(getSessionStateBackupKey(id));
    return null;
  }
}

function setStoredSessionStateBackup(id: string, state: SessionState): void {
  if (!hasRestorableSessionContent(state)) {
    return;
  }

  localStorage.setItem(getSessionStateBackupKey(id), JSON.stringify(state));
}

function removeStoredSessionStateBackup(id: string): void {
  localStorage.removeItem(getSessionStateBackupKey(id));
}

function getFilesPagePath(group: { pages: GroupPage[] }): string {
  return group.pages.find((page) => page.type === "files")?.path || ".";
}

function getFolderName(path: string): string {
  const normalized = path.replace(/\/+$/, "");
  if (!normalized) {
    return path || "/";
  }
  return normalized.split("/").pop() || normalized;
}

function getAutoSessionName(groups: Array<{ name: string }>): string {
  if (groups.length === 0) {
    return "Untitled Session";
  }
  const firstName = groups[0]?.name || "Untitled Session";
  if (groups.length === 1) {
    return firstName;
  }
  return `${firstName} +${groups.length - 1}`;
}

function normalizeFileManagerSnapshot(
  snapshot: Partial<SessionState["fileManagerByGroup"][string]> | undefined,
  fallbackPath: string
): SessionState["fileManagerByGroup"][string] {
  const safePath = fallbackPath || ".";
  const currentPath =
    typeof snapshot?.currentPath === "string" && snapshot.currentPath.length > 0 ? snapshot.currentPath : safePath;
  const rootPath =
    typeof snapshot?.rootPath === "string" && snapshot.rootPath.length > 0 ? snapshot.rootPath : safePath;
  const pathHistory =
    Array.isArray(snapshot?.pathHistory) && snapshot.pathHistory.length > 0
      ? snapshot.pathHistory.filter((path): path is string => typeof path === "string" && path.length > 0)
      : [currentPath];
  const historyLength = pathHistory.length;
  const historyIndexRaw =
    typeof snapshot?.historyIndex === "number" && Number.isFinite(snapshot.historyIndex)
      ? snapshot.historyIndex
      : historyLength - 1;
  const historyIndex = Math.min(Math.max(Math.trunc(historyIndexRaw), 0), historyLength - 1);
  return {
    currentPath: pathHistory[historyIndex] || currentPath,
    rootPath,
    pathHistory,
    historyIndex,
  };
}

function isDefaultFileManagerState(state: FileManagerState): boolean {
  return (
    !state.initialized &&
    state.currentPath === "." &&
    state.rootPath === "." &&
    state.pathHistory.length === 1 &&
    state.pathHistory[0] === "." &&
    state.historyIndex === 0
  );
}

function readFileManagerSnapshot(groupId: string, fallbackPath: string) {
  const store = getOrCreateFileManagerStore(groupId);
  const state = store.getState();
  if (isDefaultFileManagerState(state)) {
    return normalizeFileManagerSnapshot(undefined, fallbackPath);
  }
  return normalizeFileManagerSnapshot(
    {
      currentPath: state.currentPath,
      rootPath: state.rootPath,
      pathHistory: state.pathHistory,
      historyIndex: state.historyIndex,
    },
    fallbackPath
  );
}

function applyFileManagerSnapshot(
  groupId: string,
  snapshot: Partial<SessionState["fileManagerByGroup"][string]> | undefined,
  fallbackPath: string
): void {
  const store = getOrCreateFileManagerStore(groupId);
  const restored = normalizeFileManagerSnapshot(snapshot, fallbackPath);
  store.getState().reset();
  store.setState({
    currentPath: restored.currentPath,
    rootPath: restored.rootPath,
    pathHistory: restored.pathHistory,
    historyIndex: restored.historyIndex,
    initialized: false,
    files: [],
    selectedFiles: new Set(),
    focusIndex: 0,
    searchQuery: "",
    searchActive: false,
    loading: false,
    error: null,
    detailFile: null,
  });
}

function removeGitStore(groupId: string): void {
  const fn = (gitStoreModule as Record<string, unknown>).removeGitStore;
  if (typeof fn === "function") {
    (fn as (value: string) => void)(groupId);
  }
}

function resetGitStores(): void {
  const fn = (gitStoreModule as Record<string, unknown>).resetGitStores;
  if (typeof fn === "function") {
    (fn as () => void)();
  }
}

function clearGroupRuntimeState(groupId: string): void {
  removeFileManagerStore(groupId);
  removeGitStore(groupId);
}

function resetWorkspaceRuntimeState(): void {
  resetFileManagerStores();
  resetGitStores();
}

function buildSessionState(): SessionState {
  const frameState = useFrameStore.getState();
  const terminalState = useTerminalStore.getState();
  const genericGroups = frameState.groups.filter((group): group is GenericGroup => group.type === "group");
  const toolGroups = frameState.groups.filter((group): group is ToolGroup => group.type === "tool");
  const settingsGroup = frameState.groups.find((group) => group.type === "settings");
  const fileManagerByGroup: SessionState["fileManagerByGroup"] = {};

  genericGroups.forEach((group) => {
    const filesPagePath = getFilesPagePath(group);
    fileManagerByGroup[group.id] = readFileManagerSnapshot(group.id, filesPagePath);
  });

  return {
    openGroups: genericGroups.map((group) => ({
      id: group.id,
      name: group.name,
      pages: group.pages,
      activePageId: group.activePageId,
    })),
    openTools: toolGroups.map((group) => ({
      id: group.id,
      pageId: group.pageId,
      name: group.name,
    })),
    terminalsByGroup: terminalState.terminalsByGroup,
    activeTerminalByGroup: terminalState.activeIdByGroup,
    listManagerOpenByGroup: terminalState.listManagerOpenByGroup,
    terminalLayouts: terminalState.terminalLayouts,
    focusedIdByGroup: terminalState.focusedIdByGroup,
    settingsOpen: !!settingsGroup,
    activeGroupId: frameState.activeGroupId,
    fileManagerByGroup,
  };
}

function parseSessionState(rawState: string): SessionState {
  if (!rawState || rawState === "{}") {
    return createEmptySessionState();
  }

  const parsed = JSON.parse(rawState) as Partial<SessionState>;
  return {
    openGroups: Array.isArray(parsed.openGroups) ? parsed.openGroups : [],
    openTools: Array.isArray(parsed.openTools) ? parsed.openTools : [],
    terminalsByGroup:
      parsed.terminalsByGroup && typeof parsed.terminalsByGroup === "object" ? parsed.terminalsByGroup : {},
    activeTerminalByGroup:
      parsed.activeTerminalByGroup && typeof parsed.activeTerminalByGroup === "object"
        ? parsed.activeTerminalByGroup
        : {},
    listManagerOpenByGroup:
      parsed.listManagerOpenByGroup && typeof parsed.listManagerOpenByGroup === "object"
        ? parsed.listManagerOpenByGroup
        : {},
    terminalLayouts:
      parsed.terminalLayouts && typeof parsed.terminalLayouts === "object" ? parsed.terminalLayouts : {},
    focusedIdByGroup:
      parsed.focusedIdByGroup && typeof parsed.focusedIdByGroup === "object" ? parsed.focusedIdByGroup : {},
    settingsOpen: !!parsed.settingsOpen,
    activeGroupId: typeof parsed.activeGroupId === "string" ? parsed.activeGroupId : null,
    fileManagerByGroup:
      parsed.fileManagerByGroup && typeof parsed.fileManagerByGroup === "object" ? parsed.fileManagerByGroup : {},
  };
}

function restoreSessionState(state: SessionState): void {
  const frameStore = useFrameStore.getState();
  frameStore.initDefaultGroups();
  resetWorkspaceRuntimeState();
  useTerminalStore.getState().reset();

  state.openGroups.forEach((group) => {
    frameStore.addFolderGroup(getFilesPagePath(group), group.name, group.id);
  });

  state.openGroups.forEach((group) => {
    frameStore.replaceGroupState(group.id, {
      name: group.name,
      pages: group.pages,
      activePageId: group.activePageId,
    });
    applyFileManagerSnapshot(group.id, state.fileManagerByGroup?.[group.id], getFilesPagePath(group));
  });

  state.openTools.forEach((tool) => {
    frameStore.addToolGroup(tool.pageId, tool.name, tool.id);
  });

  if (state.settingsOpen || state.activeGroupId === "settings") {
    frameStore.addSettingsGroup();
  }

  useTerminalStore.setState({
    terminalsByGroup: state.terminalsByGroup || {},
    activeIdByGroup: state.activeTerminalByGroup || {},
    listManagerOpenByGroup: state.listManagerOpenByGroup || {},
    terminalLayouts: state.terminalLayouts || {},
    focusedIdByGroup: state.focusedIdByGroup || {},
  });

  const currentGroups = useFrameStore.getState().groups;
  const fallbackActiveGroupId =
    state.openGroups.find((group) => currentGroups.some((currentGroup) => currentGroup.id === group.id))?.id ||
    (state.settingsOpen && currentGroups.some((group) => group.id === "settings") ? "settings" : null) ||
    state.openTools.find((tool) => currentGroups.some((group) => group.id === tool.id))?.id ||
    currentGroups[0]?.id ||
    null;
  const activeGroupId =
    state.activeGroupId && currentGroups.some((group) => group.id === state.activeGroupId)
      ? state.activeGroupId
      : fallbackActiveGroupId;

  if (activeGroupId) {
    frameStore.setActiveGroup(activeGroupId);
  }
}

function updateSessionNameInList(sessions: SessionInfo[], sessionId: string, name: string): SessionInfo[] {
  return sessions.map((session) => (session.id === sessionId ? { ...session, name } : session));
}

export const useSessionStore = create<SessionStoreState>((set, get) => ({
  currentSessionId: getStoredSessionId(),
  sessions: [],
  loading: false,
  error: null,

  initAutoSave: () => {
    if (autoSaveUnsub) return;

    const scheduleAutoSave = () => {
      if (autoSaveTimer) clearTimeout(autoSaveTimer);
      autoSaveTimer = setTimeout(() => {
        get().saveCurrentSession();
      }, 1000);
    };

    const frameUnsub = useFrameStore.subscribe(scheduleAutoSave);
    const terminalUnsub = useTerminalStore.subscribe(scheduleAutoSave);

    autoSaveUnsub = () => {
      frameUnsub();
      terminalUnsub();
    };
  },

  loadSessions: async () => {
    set({ loading: true, error: null });
    try {
      const res = await sessionApi.list();
      set({ sessions: res.sessions || [], loading: false });
    } catch (e) {
      set({ error: (e as Error).message, loading: false });
    }
  },

  initSession: async () => {
    get().initAutoSave();
    await get().loadSessions();
    const { currentSessionId, sessions, switchSession } = get();
    if (currentSessionId && sessions.some((session) => session.id === currentSessionId)) {
      await switchSession(currentSessionId);
      return get().currentSessionId !== null;
    }
    if (currentSessionId) {
      set({ currentSessionId: null });
      setStoredSessionId(null);
    }
    return false;
  },

  createSession: async (name: string) => {
    try {
      const res = await sessionApi.create(name);
      await get().loadSessions();
      set({ currentSessionId: res.id });
      setStoredSessionId(res.id);
      return res.id;
    } catch (e) {
      set({ error: (e as Error).message });
      throw e;
    }
  },

  openFolder: async (folderPath: string) => {
    try {
      const folder = await fileApi.list(folderPath);
      const resolvedPath = folder.path || folderPath;
      const folderName = getFolderName(resolvedPath);
      const frameStore = useFrameStore.getState();
      const existingGroup = frameStore.groups.find(
        (group): group is GenericGroup => group.type === "group" && getFilesPagePath(group) === resolvedPath
      );

      if (existingGroup) {
        frameStore.setActiveGroup(existingGroup.id);
        return get().currentSessionId || "";
      }

      let sessionId = get().currentSessionId;
      if (!sessionId) {
        const created = await sessionApi.create(folderName);
        sessionId = created.id;
        set({ currentSessionId: sessionId });
        setStoredSessionId(sessionId);
      }

      const groupId = frameStore.addFolderGroup(resolvedPath, folderName);
      applyFileManagerSnapshot(groupId, undefined, resolvedPath);

      const state = buildSessionState();
      const sessionName = getAutoSessionName(state.openGroups);

      setStoredSessionStateBackup(sessionId, state);
      await sessionApi.update(sessionId, {
        name: sessionName,
        state: JSON.stringify(state),
      });

      set((store) => ({
        currentSessionId: sessionId,
        sessions: updateSessionNameInList(store.sessions, sessionId, sessionName),
      }));
      setStoredSessionId(sessionId);
      await get().loadSessions();
      return sessionId;
    } catch (e) {
      set({ error: (e as Error).message });
      throw e;
    }
  },

  createSessionFromFolder: async (folderPath: string) => {
    return get().openFolder(folderPath);
  },

  closeFolderGroup: async (groupId: string) => {
    const frameStore = useFrameStore.getState();
    const targetGroup = frameStore.groups.find(
      (group): group is GenericGroup => group.type === "group" && group.id === groupId
    );

    if (!targetGroup) {
      frameStore.removeGroup(groupId);
      return;
    }

    const folderGroups = frameStore.groups.filter((group): group is GenericGroup => group.type === "group");
    const { currentSessionId } = get();

    try {
      if (!currentSessionId || folderGroups.length <= 1) {
        frameStore.removeGroup(groupId);
        clearGroupRuntimeState(groupId);

        if (currentSessionId) {
          await sessionApi.delete(currentSessionId);
          removeStoredSessionStateBackup(currentSessionId);
        }

        set((store) => ({
          currentSessionId: null,
          sessions: currentSessionId
            ? store.sessions.filter((session) => session.id !== currentSessionId)
            : store.sessions,
        }));
        setStoredSessionId(null);
        resetWorkspaceRuntimeState();
        await get().loadSessions();
        return;
      }

      frameStore.removeGroup(groupId);
      clearGroupRuntimeState(groupId);

      const state = buildSessionState();
      const sessionName = getAutoSessionName(state.openGroups);

      setStoredSessionStateBackup(currentSessionId, state);
      await sessionApi.update(currentSessionId, {
        name: sessionName,
        state: JSON.stringify(state),
      });

      set((store) => ({
        sessions: updateSessionNameInList(store.sessions, currentSessionId, sessionName),
      }));
      await get().loadSessions();
    } catch (e) {
      set({ error: (e as Error).message });
    }
  },

  switchSession: async (id: string) => {
    set({ loading: true, error: null });
    try {
      const previousSessionId = get().currentSessionId;
      if (previousSessionId && previousSessionId !== id) {
        await get().saveCurrentSession();
      }

      await cleanupAllTerminals();

      let remoteState: SessionState | null = null;
      try {
        const detail = await sessionApi.get(id);
        if (detail.state && detail.state !== "{}") {
          try {
            const parsed = parseSessionState(detail.state);
            if (hasRestorableSessionContent(parsed)) {
              remoteState = parsed;
            }
          } catch {}
        }
      } catch {
        const backupState = getStoredSessionStateBackup(id);
        if (backupState && hasRestorableSessionContent(backupState)) {
          try {
            restoreSessionState(backupState);
            set({ currentSessionId: id, loading: false });
            setStoredSessionId(id);
            return;
          } catch {}
        }

        removeStoredSessionStateBackup(id);
        set({ currentSessionId: null, loading: false });
        setStoredSessionId(null);
        useFrameStore.getState().initDefaultGroups();
        resetWorkspaceRuntimeState();
        await get().loadSessions();
        return;
      }

      const backupState = getStoredSessionStateBackup(id);
      const restoreCandidates: SessionState[] = [];

      if (remoteState) {
        restoreCandidates.push(remoteState);
      }

      if (backupState) {
        restoreCandidates.push(backupState);
      }

      if (restoreCandidates.length === 0) {
        restoreCandidates.push(createEmptySessionState());
      }

      let restoredState = createEmptySessionState();
      let restored = false;
      for (const candidate of restoreCandidates) {
        try {
          restoreSessionState(candidate);
          restoredState = candidate;
          restored = true;
          break;
        } catch {}
      }

      if (!restored) {
        restoreSessionState(restoredState);
      }

      if (hasRestorableSessionContent(restoredState)) {
        setStoredSessionStateBackup(id, restoredState);
      }

      try {
        const terminalList = await terminalApi.list();
        const remoteStatus = new Map(terminalList.terminals.map((terminal) => [terminal.id, terminal.status]));
        const terminalStore = useTerminalStore.getState();
        const normalized: Record<string, TerminalSession[]> = {};

        for (const [groupId, terminals] of Object.entries(terminalStore.terminalsByGroup)) {
          normalized[groupId] = terminals.map((terminal) => {
            const status = remoteStatus.get(terminal.id);
            if (status) {
              return { ...terminal, status };
            }
            if (!terminal.status || terminal.status === "running") {
              return { ...terminal, status: "exited" };
            }
            return terminal;
          });
        }

        useTerminalStore.setState({ terminalsByGroup: normalized });
      } catch {}

      set({ currentSessionId: id, loading: false });
      setStoredSessionId(id);
    } catch (e) {
      set({ currentSessionId: null, error: (e as Error).message, loading: false });
      setStoredSessionId(null);
      useFrameStore.getState().initDefaultGroups();
      resetWorkspaceRuntimeState();
    }
  },

  saveCurrentSession: async () => {
    const { currentSessionId } = get();
    if (!currentSessionId) return;

    const state = buildSessionState();
    const sessionName = state.openGroups.length > 0 ? getAutoSessionName(state.openGroups) : undefined;

    try {
      if (!hasRestorableSessionContent(state)) {
        const backupState = getStoredSessionStateBackup(currentSessionId);
        if (backupState) {
          return;
        }

        try {
          const detail = await sessionApi.get(currentSessionId);
          if (detail.state && detail.state !== "{}") {
            const remoteState = parseSessionState(detail.state);
            if (hasRestorableSessionContent(remoteState)) {
              setStoredSessionStateBackup(currentSessionId, remoteState);
              return;
            }
          }
        } catch {
          return;
        }
      } else {
        setStoredSessionStateBackup(currentSessionId, state);
      }

      try {
        await sessionApi.update(currentSessionId, {
          name: sessionName,
          state: JSON.stringify(state),
        });
      } catch {
        return;
      }

      if (sessionName) {
        set((store) => ({
          sessions: updateSessionNameInList(store.sessions, currentSessionId, sessionName),
        }));
      }
    } catch (e) {
      set({ error: (e as Error).message });
    }
  },

  deleteSession: async (id: string) => {
    try {
      await sessionApi.delete(id);
      removeStoredSessionStateBackup(id);
      const { currentSessionId, sessions } = get();
      if (currentSessionId === id) {
        const remaining = sessions.filter((session) => session.id !== id);
        const nextSessionId = remaining[0]?.id || null;
        set({ currentSessionId: nextSessionId });
        setStoredSessionId(nextSessionId);
        if (nextSessionId) {
          await get().switchSession(nextSessionId);
        } else {
          useFrameStore.getState().initDefaultGroups();
          resetWorkspaceRuntimeState();
        }
      }
      await get().loadSessions();
    } catch (e) {
      set({ error: (e as Error).message });
    }
  },

  clearAllSessions: async () => {
    const { sessions } = get();
    try {
      for (const session of sessions) {
        await sessionApi.delete(session.id);
        removeStoredSessionStateBackup(session.id);
      }
      set({ currentSessionId: null, sessions: [] });
      setStoredSessionId(null);
      useFrameStore.getState().initDefaultGroups();
      resetWorkspaceRuntimeState();
    } catch (e) {
      set({ error: (e as Error).message });
    }
  },

  renameSession: async (id: string, name: string) => {
    try {
      await sessionApi.update(id, { name });
      await get().loadSessions();
    } catch (e) {
      set({ error: (e as Error).message });
    }
  },

  getCurrentSessionId: () => get().currentSessionId,

  setCurrentSessionId: (id: string | null) => {
    set({ currentSessionId: id });
    setStoredSessionId(id);
  },
}));
