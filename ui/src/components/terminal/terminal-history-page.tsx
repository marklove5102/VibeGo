import { ArrowLeft, CheckSquare, RefreshCw, Square, Terminal, Trash2, X } from "lucide-react";
import React, { useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type { TerminalInfo } from "@/api/terminal";
import { useTerminalDeleteBatch, useTerminalList } from "@/hooks/use-terminal";
import { useTranslation } from "@/lib/i18n";
import { useAppStore } from "@/stores";
import TerminalInstance from "./terminal-instance";

interface TerminalHistoryPageProps {
  onBack: () => void;
}

const TerminalHistoryPage: React.FC<TerminalHistoryPageProps> = ({ onBack }) => {
  const locale = useAppStore((s) => s.locale);
  const t = useTranslation(locale);
  const { data, isLoading, refetch } = useTerminalList();
  const deleteBatchMutation = useTerminalDeleteBatch();

  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [viewingTerminal, setViewingTerminal] = useState<TerminalInfo | null>(null);

  const terminals = data?.terminals || [];
  const closedTerminals = terminals.filter((t) => t.status === "closed");

  const toggleSelect = (id: string) => {
    const newSet = new Set(selectedIds);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setSelectedIds(newSet);
  };

  const selectAll = () => {
    setSelectedIds(new Set(closedTerminals.map((t) => t.id)));
  };

  const clearSelection = () => {
    setSelectedIds(new Set());
  };

  const handleItemClick = (terminal: TerminalInfo) => {
    if (selectionMode) {
      toggleSelect(terminal.id);
    } else {
      setViewingTerminal(terminal);
    }
  };

  const handleDeleteSelected = () => {
    if (selectedIds.size > 0) {
      setShowDeleteConfirm(true);
    }
  };

  const confirmDelete = () => {
    deleteBatchMutation.mutate(Array.from(selectedIds), {
      onSuccess: () => {
        setSelectedIds(new Set());
        setShowDeleteConfirm(false);
        setSelectionMode(false);
        refetch();
      },
    });
  };

  const formatDate = (timestamp: number) => {
    return new Date(timestamp * 1000).toLocaleString();
  };

  const exitSelectionMode = () => {
    setSelectionMode(false);
    setSelectedIds(new Set());
  };

  if (viewingTerminal) {
    return (
      <div className="flex flex-col h-full bg-ide-bg">
        <div className="h-12 bg-ide-bg border-b border-ide-border flex items-center px-3 gap-2 shrink-0">
          <button
            onClick={() => setViewingTerminal(null)}
            className="p-2 rounded-md text-ide-mute hover:bg-ide-bg hover:text-ide-text"
          >
            <ArrowLeft size={18} />
          </button>
          <Terminal size={18} className="text-ide-mute" />
          <span className="font-medium text-ide-text flex-1 truncate">{viewingTerminal.name}</span>
          <span className="text-xs text-ide-mute">{t("terminal.readOnly")}</span>
        </div>
        <div className="flex-1 relative overflow-hidden">
          <TerminalInstance
            terminalId={viewingTerminal.id}
            isActive={true}
            isExited={true}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-ide-panel">
      <div className="h-12 bg-ide-bg border-b border-ide-border flex items-center px-3 gap-2 shrink-0">
        <button
          onClick={onBack}
          className="p-2 rounded-md text-ide-mute hover:bg-ide-bg hover:text-ide-text"
        >
          <ArrowLeft size={18} />
        </button>
        <span className="font-medium text-ide-text flex-1">{t("terminal.historyTitle")}</span>
        {!selectionMode && closedTerminals.length > 0 && (
          <button
            onClick={() => setSelectionMode(true)}
            className="p-2 rounded-md text-ide-mute hover:bg-ide-bg hover:text-ide-text"
          >
            <CheckSquare size={18} />
          </button>
        )}
        <button
          onClick={() => refetch()}
          className="p-2 rounded-md text-ide-mute hover:bg-ide-bg hover:text-ide-text"
        >
          <RefreshCw size={18} />
        </button>
      </div>

      {selectionMode && (
        <div className="flex items-center gap-1 h-10 px-3 bg-ide-bg border-b border-ide-border">
          <button
            onClick={exitSelectionMode}
            className="p-2 rounded-md text-ide-accent hover:bg-ide-bg"
          >
            <X size={18} />
          </button>
          <span className="text-xs text-ide-mute px-2">{selectedIds.size} {t("terminal.selected")}</span>
          <button
            onClick={selectAll}
            className="p-2 rounded-md text-ide-mute hover:bg-ide-bg hover:text-ide-text"
          >
            <CheckSquare size={18} />
          </button>
          <button
            onClick={clearSelection}
            className="p-2 rounded-md text-ide-mute hover:bg-ide-bg hover:text-ide-text"
          >
            <Square size={18} />
          </button>
          <div className="flex-1" />
          {selectedIds.size > 0 && (
            <button
              onClick={handleDeleteSelected}
              className="p-2 rounded-md text-red-500 hover:bg-red-500/10"
            >
              <Trash2 size={18} />
            </button>
          )}
        </div>
      )}

      <div className="flex-1 overflow-auto p-3">
        {isLoading ? (
          <div className="flex items-center justify-center py-10 text-ide-mute">
            <span className="text-sm">{t("common.loading")}</span>
          </div>
        ) : closedTerminals.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-ide-mute">
            <Terminal size={40} className="mb-4 opacity-50" />
            <p className="text-sm">{t("terminal.noHistory")}</p>
          </div>
        ) : (
          <div className="space-y-1">
            {closedTerminals.map((terminal) => {
              const isSelected = selectedIds.has(terminal.id);
              return (
                <div
                  key={terminal.id}
                  onClick={() => handleItemClick(terminal)}
                  className={`group flex items-center gap-2 p-2.5 rounded-lg border transition-all cursor-pointer ${
                    isSelected
                      ? "bg-ide-accent/10 border-ide-accent/30"
                      : "border-transparent hover:bg-ide-bg hover:border-ide-border"
                  }`}
                >
                  {selectionMode && (
                    <div className="p-1.5 rounded-lg flex-shrink-0 bg-ide-bg group-hover:bg-ide-panel">
                      {isSelected ? (
                        <CheckSquare size={18} className="text-ide-accent" />
                      ) : (
                        <Square size={18} className="text-ide-mute" />
                      )}
                    </div>
                  )}

                  <div className="p-1.5 rounded-lg flex-shrink-0 bg-ide-bg group-hover:bg-ide-panel">
                    <Terminal size={18} className="text-ide-mute" />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium truncate text-sm text-ide-text">
                        {terminal.name}
                      </span>
                    </div>
                    <div className="text-xs text-ide-mute mt-0.5">
                      {formatDate(terminal.created_at)} - {terminal.cwd}
                    </div>
                  </div>

                  {!selectionMode && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedIds(new Set([terminal.id]));
                        setShowDeleteConfirm(true);
                      }}
                      className="p-2 rounded-md text-ide-mute hover:bg-ide-bg hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("terminal.deleteHistoryTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("terminal.deleteHistoryConfirm").replace("{count}", String(selectedIds.size))}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-red-500 hover:bg-red-600"
              disabled={deleteBatchMutation.isPending}
            >
              {t("common.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default TerminalHistoryPage;
