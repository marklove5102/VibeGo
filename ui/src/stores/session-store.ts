import { create } from "zustand";
import { type SessionInfo, sessionApi } from "../api/session";
import { terminalApi } from "../api/terminal";
import { cleanupAllTerminals } from "../services/terminal-cleanup-service";
import { useFileManagerStore } from "./file-manager-store";
import { type GenericGroup, type GroupPage, type ToolGroup, useFrameStore } from "./frame-store";
import { type TerminalSession, useTerminalStore } from "./terminal-store";

const CURRENT_SESSION_KEY = "current_session_id";

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
  createSessionFromFolder: (folderPath: string) => Promise<string>;
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
    settingsOpen: false,
    activeGroupId: null,
    fileManagerByGroup: {},
  };
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

function buildSessionState(): SessionState {
  const frameState = useFrameStore.getState();
  const fileManagerState = useFileManagerStore.getState();
  const terminalState = useTerminalStore.getState();
  const genericGroups = frameState.groups.filter((g): g is GenericGroup => g.type === "group");
  const toolGroups = frameState.groups.filter((g): g is ToolGroup => g.type === "tool");
  const settingsGroup = frameState.groups.find((g) => g.type === "settings");
  const fileManagerByGroup: SessionState["fileManagerByGroup"] = {};

  genericGroups.forEach((group) => {
    const filesPagePath = group.pages.find((page) => page.type === "files")?.path || ".";
    fileManagerByGroup[group.id] = normalizeFileManagerSnapshot(
      {
        currentPath: filesPagePath,
        rootPath: filesPagePath,
        pathHistory: [filesPagePath],
        historyIndex: 0,
      },
      filesPagePath
    );
  });

  const activeGroup = frameState.groups.find(
    (group): group is GenericGroup => group.type === "group" && group.id === frameState.activeGroupId
  );
  if (activeGroup) {
    const activeFilesPagePath = activeGroup.pages.find((page) => page.type === "files")?.path || ".";
    fileManagerByGroup[activeGroup.id] = normalizeFileManagerSnapshot(
      {
        currentPath: fileManagerState.currentPath,
        rootPath: fileManagerState.rootPath,
        pathHistory: fileManagerState.pathHistory,
        historyIndex: fileManagerState.historyIndex,
      },
      activeFilesPagePath
    );
  }

  return {
    openGroups: genericGroups.map((g) => ({
      id: g.id,
      name: g.name,
      pages: g.pages,
      activePageId: g.activePageId,
    })),
    openTools: toolGroups.map((g) => ({
      id: g.id,
      pageId: g.pageId,
      name: g.name,
    })),
    terminalsByGroup: terminalState.terminalsByGroup,
    activeTerminalByGroup: terminalState.activeIdByGroup,
    listManagerOpenByGroup: terminalState.listManagerOpenByGroup,
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
    settingsOpen: !!parsed.settingsOpen,
    activeGroupId: typeof parsed.activeGroupId === "string" ? parsed.activeGroupId : null,
    fileManagerByGroup:
      parsed.fileManagerByGroup && typeof parsed.fileManagerByGroup === "object" ? parsed.fileManagerByGroup : {},
  };
}

function restoreSessionState(state: SessionState): void {
  const frameStore = useFrameStore.getState();
  frameStore.initDefaultGroups();
  useFileManagerStore.getState().reset();
  useTerminalStore.getState().reset();

  state.openGroups.forEach((group) => {
    const firstFilesPage = group.pages.find((p) => p.type === "files");
    const path = firstFilesPage?.path || ".";
    frameStore.addFolderGroup(path, group.name, group.id);
  });

  state.openGroups.forEach((group) => {
    frameStore.replaceGroupState(group.id, {
      name: group.name,
      pages: group.pages,
      activePageId: group.activePageId,
    });
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

  const activeGroup = useFrameStore.getState().groups.find((group) => group.id === activeGroupId);
  if (activeGroup?.type === "group") {
    const filesPagePath = activeGroup.pages.find((page) => page.type === "files")?.path || ".";
    const restoredFileManagerState = normalizeFileManagerSnapshot(
      state.fileManagerByGroup?.[activeGroup.id],
      filesPagePath
    );
    useFileManagerStore.setState({
      currentPath: restoredFileManagerState.currentPath,
      rootPath: restoredFileManagerState.rootPath,
      pathHistory: restoredFileManagerState.pathHistory,
      historyIndex: restoredFileManagerState.historyIndex,
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
    if (currentSessionId && sessions.some((s) => s.id === currentSessionId)) {
      await switchSession(currentSessionId);
      return true;
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

  createSessionFromFolder: async (folderPath: string) => {
    const folderName = folderPath.split("/").pop() || folderPath;
    const frameStore = useFrameStore.getState();
    const fileManagerStore = useFileManagerStore.getState();

    try {
      const res = await sessionApi.create(folderName);
      await get().loadSessions();

      frameStore.initDefaultGroups();
      fileManagerStore.reset();
      const groupId = frameStore.addFolderGroup(folderPath, folderName);

      const state: SessionState = {
        openGroups: [
          {
            id: groupId,
            name: folderName,
            pages: [
              { id: `${groupId}-files`, type: "files", label: "Files", path: folderPath, tabs: [], activeTabId: null },
              { id: `${groupId}-git`, type: "git", label: "Git", path: folderPath, tabs: [], activeTabId: null },
              {
                id: `${groupId}-terminal`,
                type: "terminal",
                label: "Terminal",
                path: folderPath,
                tabs: [],
                activeTabId: null,
              },
            ],
            activePageId: `${groupId}-files`,
          },
        ],
        openTools: [],
        terminalsByGroup: {},
        activeTerminalByGroup: {},
        listManagerOpenByGroup: {},
        settingsOpen: false,
        activeGroupId: groupId,
        fileManagerByGroup: {
          [groupId]: {
            currentPath: folderPath,
            rootPath: folderPath,
            pathHistory: [folderPath],
            historyIndex: 0,
          },
        },
      };

      await sessionApi.update(res.id, { state: JSON.stringify(state) });

      set({ currentSessionId: res.id });
      setStoredSessionId(res.id);
      return res.id;
    } catch (e) {
      set({ error: (e as Error).message });
      throw e;
    }
  },

  switchSession: async (id: string) => {
    set({ loading: true, error: null });
    try {
      await cleanupAllTerminals();

      const detail = await sessionApi.get(id);
      let state = createEmptySessionState();

      if (detail.state && detail.state !== "{}") {
        try {
          state = parseSessionState(detail.state);
        } catch {
          state = createEmptySessionState();
        }
      }

      restoreSessionState(state);

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
      set({ error: (e as Error).message, loading: false });
    }
  },

  saveCurrentSession: async () => {
    const { currentSessionId } = get();
    if (!currentSessionId) return;

    const state = buildSessionState();
    try {
      await sessionApi.update(currentSessionId, {
        state: JSON.stringify(state),
      });
    } catch (e) {
      set({ error: (e as Error).message });
    }
  },

  deleteSession: async (id: string) => {
    try {
      await sessionApi.delete(id);
      const { currentSessionId, sessions } = get();
      if (currentSessionId === id) {
        const remaining = sessions.filter((s) => s.id !== id);
        const newCurrentId = remaining.length > 0 ? remaining[0].id : null;
        set({ currentSessionId: newCurrentId });
        setStoredSessionId(newCurrentId);
        if (newCurrentId) {
          await get().switchSession(newCurrentId);
        } else {
          useFrameStore.getState().initDefaultGroups();
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
      }
      set({ currentSessionId: null, sessions: [] });
      setStoredSessionId(null);
      useFrameStore.getState().initDefaultGroups();
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
