import { Plus, Terminal, X } from "lucide-react";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { usePageTopBar } from "@/hooks/use-page-top-bar";
import { useTerminalClose, useTerminalCreate, useTerminalDelete } from "@/hooks/use-terminal";
import { type TerminalSession, useTerminalStore } from "@/stores/terminal-store";
import TerminalHistoryPage from "./terminal-history-page";
import TerminalInstance from "./terminal-instance";
import TerminalListManager from "./terminal-list-manager";

interface TerminalPageProps {
  groupId: string;
  cwd?: string;
}

const EMPTY_TERMINALS: TerminalSession[] = [];

const TerminalPage: React.FC<TerminalPageProps> = ({ groupId, cwd }) => {
  const terminals = useTerminalStore((s) => s.terminalsByGroup[groupId] || EMPTY_TERMINALS);
  const activeTerminalId = useTerminalStore((s) => s.activeIdByGroup[groupId] ?? null);
  const listManagerOpen = useTerminalStore((s) => s.listManagerOpenByGroup[groupId] ?? true);
  const [showHistory, setShowHistory] = useState(false);

  const setActiveId = useTerminalStore((s) => s.setActiveId);
  const setListManagerOpen = useTerminalStore((s) => s.setListManagerOpen);
  const renameTerminal = useTerminalStore((s) => s.renameTerminal);
  const setTerminalStatus = useTerminalStore((s) => s.setTerminalStatus);
  const removeTerminal = useTerminalStore((s) => s.removeTerminal);

  const closeTerminalMutation = useTerminalClose(groupId);
  const deleteTerminalMutation = useTerminalDelete(groupId);
  const createTerminalMutation = useTerminalCreate(groupId);

  const handleTerminalExited = useCallback(
    (terminalId: string) => {
      setTerminalStatus(groupId, terminalId, "exited");
    },
    [groupId, setTerminalStatus]
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
      if (terminals.length === 0) {
        return;
      }
      if (!activeTerminalId) {
        const lastTerminal = terminals[terminals.length - 1];
        setActiveId(groupId, lastTerminal.id);
      }
    }
    setListManagerOpen(groupId, !listManagerOpen);
  }, [groupId, listManagerOpen, setListManagerOpen, terminals, activeTerminalId, setActiveId]);

  useEffect(() => {
    if (terminals.length === 0) {
      setListManagerOpen(groupId, true);
    }
  }, [terminals.length, setListManagerOpen, groupId]);

  const handleTabClick = useCallback(
    (terminalId: string) => {
      setActiveId(groupId, terminalId);
    },
    [groupId, setActiveId]
  );

  const displayTerminals = useMemo(() => [...terminals].reverse(), [terminals]);

  const topBarConfig = useMemo(() => {
    return {
      show: true,
      leftButtons: [
        {
          icon: <Terminal size={18} />,
          onClick: handleToggleListManager,
          active: listManagerOpen,
        },
      ],
      centerContent:
        terminals.length > 0 ? (
          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar touch-pan-x h-full">
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
      rightButtons: [
        {
          icon: <Plus size={18} />,
          onClick: handleCreateTerminal,
        },
      ],
    };
  }, [
    handleToggleListManager,
    handleCreateTerminal,
    handleTabClick,
    listManagerOpen,
    terminals,
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
            terminals={terminals}
            activeTerminalId={activeTerminalId}
            onSelect={(id) => {
              setActiveId(groupId, id);
              setListManagerOpen(groupId, false);
            }}
            onRename={(id, name) => renameTerminal(groupId, id, name)}
            onClose={(id) => closeTerminalMutation.mutate(id)}
            onDelete={(id) => deleteTerminalMutation.mutate(id)}
            onClearAll={handleClearAll}
            onBack={() => {}}
            onManageHistory={() => setShowHistory(true)}
            embedded={true}
          />
        ) : (
          terminals.map((terminal) => (
            <TerminalInstance
              key={terminal.id}
              terminalId={terminal.id}
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
