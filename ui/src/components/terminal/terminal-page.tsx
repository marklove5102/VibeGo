import { Columns, Edit2, Plus, Rows, Terminal, X, XCircle } from "lucide-react";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { terminalApi } from "@/api/terminal";
import { useDialog } from "@/components/common";
import { usePageTopBar } from "@/hooks/use-page-top-bar";
import { useTerminalClose, useTerminalCreate, useTerminalDelete, useTerminalRename } from "@/hooks/use-terminal";
import { useTranslation } from "@/lib/i18n";
import { syncTerminalWorkspaceState, useSessionStore } from "@/stores/session-store";
import { useAppStore } from "@/stores";
import { useFrameStore } from "@/stores/frame-store";
import { type SplitDirection, type TerminalSession, useTerminalStore } from "@/stores/terminal-store";
import TerminalHistoryPage from "./terminal-history-page";
import TerminalInstance from "./terminal-instance";
import TerminalListManager from "./terminal-list-manager";
import TerminalSplitView from "./terminal-split-view";

interface TerminalPageProps {
  groupId: string;
  cwd?: string;
}

const EMPTY_TERMINALS: TerminalSession[] = [];

const TerminalPage: React.FC<TerminalPageProps> = ({ groupId, cwd }) => {
  const dialog = useDialog();
  const locale = useAppStore((s) => s.locale);
  const t = useTranslation(locale);
  const currentSessionId = useSessionStore((s) => s.currentSessionId);
  const terminals = useTerminalStore((s) => s.terminalsByGroup[groupId] || EMPTY_TERMINALS);
  const terminalsByGroup = useTerminalStore((s) => s.terminalsByGroup);
  const activeIdByGroup = useTerminalStore((s) => s.activeIdByGroup);
  const listManagerOpenByGroup = useTerminalStore((s) => s.listManagerOpenByGroup);
  const terminalLayouts = useTerminalStore((s) => s.terminalLayouts);
  const focusedIdByGroup = useTerminalStore((s) => s.focusedIdByGroup);
  const activeTerminalId = useTerminalStore((s) => s.activeIdByGroup[groupId] ?? null);
  const listManagerOpen = useTerminalStore((s) => s.listManagerOpenByGroup[groupId] ?? true);
  const activeLayout = useTerminalStore((s) => s.getActiveLayout(groupId));
  const focusedId = useTerminalStore((s) => s.focusedIdByGroup[groupId] ?? null);
  const hasSplit = useTerminalStore((s) => s.isSplit(groupId));
  const [showHistory, setShowHistory] = useState(false);
  const syncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const setPageMenuItems = useFrameStore((s) => s.setPageMenuItems);
  const setActiveId = useTerminalStore((s) => s.setActiveId);
  const setListManagerOpen = useTerminalStore((s) => s.setListManagerOpen);
  const setTerminalStatus = useTerminalStore((s) => s.setTerminalStatus);
  const removeTerminal = useTerminalStore((s) => s.removeTerminal);
  const setFocusedId = useTerminalStore((s) => s.setFocusedId);
  const splitTerminalInStore = useTerminalStore((s) => s.splitTerminal);
  const addTerminal = useTerminalStore((s) => s.addTerminal);
  const updateSplitRatio = useTerminalStore((s) => s.updateSplitRatio);

  const closeTerminalMutation = useTerminalClose(groupId);
  const deleteTerminalMutation = useTerminalDelete(groupId);
  const createTerminalMutation = useTerminalCreate(groupId);
  const renameTerminalMutation = useTerminalRename(groupId);

  const rootTerminals = useMemo(() => terminals.filter((t) => !t.parentId), [terminals]);
  const displayTerminals = useMemo(() => [...rootTerminals].reverse(), [rootTerminals]);

  const handleTerminalExited = useCallback(
    (terminalId: string) => {
      setTerminalStatus(groupId, terminalId, "exited");
    },
    [groupId, setTerminalStatus],
  );

  const handleClearAll = useCallback(() => {
    terminals.forEach((t) => {
      closeTerminalMutation.mutate(t.id);
    });
  }, [terminals, closeTerminalMutation]);

  const handleCreateTerminal = useCallback(() => {
    createTerminalMutation.mutate({ cwd });
  }, [createTerminalMutation, cwd]);

  const handleToggleListManager = useCallback(() => {
    if (listManagerOpen) {
      if (rootTerminals.length === 0) return;
      if (!activeTerminalId) {
        const last = rootTerminals[rootTerminals.length - 1];
        setActiveId(groupId, last.id);
      }
    }
    setListManagerOpen(groupId, !listManagerOpen);
  }, [groupId, listManagerOpen, setListManagerOpen, rootTerminals, activeTerminalId, setActiveId]);

  useEffect(() => {
    if (rootTerminals.length === 0) {
      setListManagerOpen(groupId, true);
    }
  }, [rootTerminals.length, setListManagerOpen, groupId]);

  const handleTabClick = useCallback(
    (terminalId: string) => {
      setActiveId(groupId, terminalId);
    },
    [groupId, setActiveId],
  );

  const focusedTerminal = useMemo(
    () => terminals.find((terminal) => terminal.id === focusedId) ?? null,
    [focusedId, terminals],
  );

  const persistTerminalRename = useCallback(
    async (terminalId: string, name: string) => {
      try {
        await renameTerminalMutation.mutateAsync({ id: terminalId, name });
      } catch (e) {
        await dialog.alert(e instanceof Error ? e.message : t("terminal.renameFailed"));
        throw e;
      }
    },
    [dialog, renameTerminalMutation, t],
  );

  const handleRenameTerminal = useCallback(
    async (terminalId: string, currentName: string) => {
      const nextName = await dialog.prompt(t("common.rename"), { defaultValue: currentName });
      const trimmedName = nextName?.trim();
      if (!trimmedName || trimmedName === currentName) return;
      await persistTerminalRename(terminalId, trimmedName);
    },
    [dialog, persistTerminalRename, t],
  );

  const getNextTerminalName = useCallback(() => {
    const nums = terminals
      .map((t) => {
        const m = t.name.match(/^Terminal (\d+)$/);
        return m ? parseInt(m[1], 10) : 0;
      })
      .filter((n) => n > 0);
    const next = nums.length > 0 ? Math.max(...nums) + 1 : 1;
    return `Terminal ${next}`;
  }, [terminals]);

  const handleSplit = useCallback(
    async (direction: SplitDirection) => {
      const targetId = focusedId || activeTerminalId;
      if (!targetId) return;
      const rootId = useTerminalStore.getState().getRootIdForTerminal(groupId, targetId) || targetId;
      const name = getNextTerminalName();
      try {
        const result = await terminalApi.create({
          cwd,
          name,
          workspace_session_id: currentSessionId || undefined,
          group_id: groupId,
          parent_id: rootId,
        });
        addTerminal(groupId, { id: result.id, name: result.name, parentId: rootId });
        splitTerminalInStore(rootId, targetId, result.id, direction);
        setFocusedId(groupId, result.id);
      } catch {}
    },
    [
      focusedId,
      activeTerminalId,
      groupId,
      cwd,
      currentSessionId,
      addTerminal,
      splitTerminalInStore,
      setFocusedId,
      getNextTerminalName,
    ],
  );

  const handleCloseSplit = useCallback(() => {
    const targetId = focusedId;
    if (!targetId || !hasSplit) return;
    const terminal = terminals.find((t) => t.id === targetId);
    if (terminal && terminal.status === "running") {
      closeTerminalMutation.mutate(targetId);
    }
    removeTerminal(groupId, targetId);
  }, [focusedId, hasSplit, terminals, closeTerminalMutation, removeTerminal, groupId]);

  const handleRatioChange = useCallback(
    (path: number[], ratio: number) => {
      updateSplitRatio(groupId, path, ratio);
    },
    [groupId, updateSplitRatio],
  );

  const handleFocusPane = useCallback(
    (terminalId: string) => {
      setFocusedId(groupId, terminalId);
    },
    [groupId, setFocusedId],
  );

  useEffect(() => {
    if (!currentSessionId) {
      return;
    }
    if (syncTimerRef.current) {
      clearTimeout(syncTimerRef.current);
    }
    syncTimerRef.current = setTimeout(() => {
      syncTimerRef.current = null;
      void syncTerminalWorkspaceState(currentSessionId, {
        terminalsByGroup,
        activeTerminalByGroup: activeIdByGroup,
        listManagerOpenByGroup,
        terminalLayouts,
        focusedIdByGroup,
      });
    }, 300);

    return () => {
      if (syncTimerRef.current) {
        clearTimeout(syncTimerRef.current);
        syncTimerRef.current = null;
      }
    };
  }, [
    currentSessionId,
    terminalsByGroup,
    activeIdByGroup,
    listManagerOpenByGroup,
    terminalLayouts,
    focusedIdByGroup,
  ]);

  useEffect(() => {
    if (showHistory || listManagerOpen || !focusedTerminal) {
      setPageMenuItems([]);
      return;
    }
    const items = [
      {
        id: "rename-terminal",
        icon: <Edit2 size={18} />,
        label: t("common.rename"),
        onClick: () => { handleRenameTerminal(focusedTerminal.id, focusedTerminal.name); },
      },
      {
        id: "split-down",
        icon: <Rows size={18} />,
        label: t("terminal.splitDown"),
        onClick: () => { handleSplit("vertical"); },
      },
      {
        id: "split-right",
        icon: <Columns size={18} />,
        label: t("terminal.splitRight"),
        onClick: () => { handleSplit("horizontal"); },
      },
    ];
    if (hasSplit) {
      items.push({
        id: "close-split",
        icon: <XCircle size={18} />,
        label: t("terminal.closeSplit"),
        onClick: handleCloseSplit,
      });
    }
    setPageMenuItems(items);
    return () => setPageMenuItems([]);
  }, [focusedTerminal, handleRenameTerminal, handleSplit, handleCloseSplit, hasSplit, listManagerOpen, setPageMenuItems, showHistory, t]);

  const topBarConfig = useMemo(() => {
    return {
      show: true,
      leftButtons: [{ icon: <Terminal size={18} />, onClick: handleToggleListManager, active: listManagerOpen }],
      centerContent:
        rootTerminals.length > 0 ? (
          <div className="flex items-center gap-2 overflow-x-auto custom-scrollbar touch-pan-x h-full">
            {displayTerminals.map((terminal) => {
              const isActive = !listManagerOpen && terminal.id === activeTerminalId;
              const isClosed = terminal.status !== "running";
              return (
                <div
                  key={terminal.id}
                  onClick={() => handleTabClick(terminal.id)}
                  className={`shrink-0 px-2 h-7 rounded-md flex items-center gap-1 text-xs border transition-all cursor-pointer ${
                    isActive
                      ? "bg-ide-panel border-ide-accent text-ide-accent border-b-2 shadow-sm"
                      : isClosed
                        ? "bg-transparent border-transparent text-ide-mute/50 hover:bg-ide-panel/50 hover:text-ide-mute"
                        : "bg-transparent border-transparent text-ide-mute hover:bg-ide-panel hover:text-ide-text"
                  }`}
                >
                  <Terminal size={12} />
                  <span className={`max-w-[80px] truncate font-medium ${!terminal.pinned ? "italic" : ""}`}>
                    {terminal.name}
                  </span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (isClosed) {
                        removeTerminal(groupId, terminal.id);
                      } else {
                        closeTerminalMutation.mutate(terminal.id);
                      }
                    }}
                    className="hover:text-red-500 rounded-full p-0.5 hover:bg-ide-bg"
                  >
                    <X size={12} />
                  </button>
                </div>
              );
            })}
          </div>
        ) : null,
      rightButtons: [{ icon: <Plus size={18} />, onClick: handleCreateTerminal }],
    };
  }, [
    handleToggleListManager,
    handleCreateTerminal,
    handleTabClick,
    listManagerOpen,
    rootTerminals,
    displayTerminals,
    activeTerminalId,
    closeTerminalMutation,
    removeTerminal,
    groupId,
  ]);

  const activeTopBarConfig = showHistory ? undefined : topBarConfig;
  usePageTopBar(activeTopBarConfig, [activeTopBarConfig]);

  if (showHistory) {
    return <TerminalHistoryPage onBack={() => setShowHistory(false)} />;
  }

  return (
    <div className="flex flex-col h-full bg-ide-bg">
      <div className="flex-1 relative overflow-hidden">
        {listManagerOpen ? (
          <TerminalListManager
            terminals={rootTerminals}
            activeTerminalId={activeTerminalId}
            onSelect={(id) => {
              setActiveId(groupId, id);
              setListManagerOpen(groupId, false);
            }}
            onRename={persistTerminalRename}
            onClose={(id) => closeTerminalMutation.mutate(id)}
            onDelete={(id) => deleteTerminalMutation.mutate(id)}
            onClearAll={handleClearAll}
            onBack={() => {}}
            onManageHistory={() => setShowHistory(true)}
            embedded={true}
          />
        ) : activeLayout ? (
          hasSplit ? (
            <TerminalSplitView
              layout={activeLayout}
              groupId={groupId}
              focusedId={focusedId}
              terminals={terminals}
              onFocus={handleFocusPane}
              onExited={handleTerminalExited}
              onRatioChange={handleRatioChange}
            />
          ) : (
            terminals.map((terminal) => (
              <TerminalInstance
                key={terminal.id}
                terminalId={terminal.id}
                terminalName={terminal.name}
                isActive={terminal.id === activeTerminalId}
                isExited={terminal.status !== "running"}
                onExited={() => handleTerminalExited(terminal.id)}
              />
            ))
          )
        ) : (
          terminals.map((terminal) => (
            <TerminalInstance
              key={terminal.id}
              terminalId={terminal.id}
              terminalName={terminal.name}
              isActive={terminal.id === activeTerminalId}
              isExited={terminal.status !== "running"}
              onExited={() => handleTerminalExited(terminal.id)}
            />
          ))
        )}
      </div>
    </div>
  );
};

export default TerminalPage;
