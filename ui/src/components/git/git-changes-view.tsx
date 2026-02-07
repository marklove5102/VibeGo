import {
  AlertTriangle,
  Archive,
  ArrowUp,
  Check,
  ChevronDown,
  ChevronRight,
  Square,
  SquareCheck,
  SquareMinus,
  Undo2,
  X,
} from "lucide-react";
import React, { useCallback, useEffect, useRef, useState } from "react";
import type { StashEntry } from "@/api/git";
import { getTranslation, type Locale } from "@/lib/i18n";
import type { GitFileNode, GitPartialSelection } from "@/stores";
import { useGitStore } from "@/stores";

type FileSelectionType = "all" | "partial" | "none";

interface GitChangesViewProps {
  allFiles: GitFileNode[];
  checkedFiles: Set<string>;
  partialSelections: Record<string, GitPartialSelection>;
  isLoading: boolean;
  locale: Locale;
  currentBranch: string;
  stashes: StashEntry[];
  conflicts: string[];
  aheadCount: number;
  onFileClick: (path: string) => void;
  onToggleFile: (path: string) => void;
  onToggleAll: () => void;
  onDiscardFile: (path: string) => void;
  onConflictClick: (path: string) => void;
  onStash: (message?: string, files?: string[]) => void;
  onStashPop: (index: number) => void;
  onStashDrop: (index: number) => void;
}

const getStatusColor = (status: string) => {
  switch (status) {
    case "modified":
      return "text-yellow-500";
    case "added":
    case "untracked":
      return "text-green-500";
    case "deleted":
      return "text-red-500";
    case "renamed":
    case "copied":
      return "text-blue-500";
    default:
      return "text-ide-mute";
  }
};

const getStatusLabel = (status: string) => {
  switch (status) {
    case "modified":
      return "M";
    case "added":
      return "A";
    case "deleted":
      return "D";
    case "renamed":
      return "R";
    case "copied":
      return "C";
    case "untracked":
      return "U";
    default:
      return "?";
  }
};

const getFileSelectionType = (
  filePath: string,
  checkedFiles: Set<string>,
  partialSelections: Record<string, GitPartialSelection>
): FileSelectionType => {
  if (partialSelections[filePath]) {
    return "partial";
  }
  return checkedFiles.has(filePath) ? "all" : "none";
};

const getAggregateSelectionType = (
  allFiles: GitFileNode[],
  checkedFiles: Set<string>,
  partialSelections: Record<string, GitPartialSelection>
): FileSelectionType => {
  if (allFiles.length === 0) {
    return "none";
  }
  const types = allFiles.map((file) => getFileSelectionType(file.path, checkedFiles, partialSelections));
  if (types.every((type) => type === "all")) {
    return "all";
  }
  if (types.every((type) => type === "none")) {
    return "none";
  }
  return "partial";
};

const renderSelectionIcon = (selectionType: FileSelectionType, size: number, className: string) => {
  if (selectionType === "all") {
    return <SquareCheck size={size} className={className} />;
  }
  if (selectionType === "partial") {
    return <SquareMinus size={size} className={className} />;
  }
  return <Square size={size} className={className} />;
};

const getFileRowClassName = (selectionType: FileSelectionType) => {
  if (selectionType === "all") {
    return "bg-ide-accent/8 ring-1 ring-inset ring-ide-accent/20 hover:bg-ide-accent/12";
  }
  if (selectionType === "partial") {
    return "bg-amber-500/7 ring-1 ring-inset ring-amber-400/18 hover:bg-amber-500/10";
  }
  return "hover:bg-ide-accent/10";
};

const getFileNameClassName = (selectionType: FileSelectionType) => {
  if (selectionType === "all") {
    return "text-xs text-ide-text truncate leading-tight";
  }
  if (selectionType === "partial") {
    return "text-xs text-amber-100 truncate leading-tight";
  }
  return "text-xs text-ide-text truncate leading-tight";
};

const getFilePathClassName = (selectionType: FileSelectionType) => {
  if (selectionType === "all") {
    return "text-[10px] text-ide-accent/80 truncate leading-tight";
  }
  if (selectionType === "partial") {
    return "text-[10px] text-amber-300/80 truncate leading-tight";
  }
  return "text-[10px] text-ide-mute/70 truncate leading-tight";
};

const GitChangesView: React.FC<GitChangesViewProps> = ({
  allFiles,
  checkedFiles,
  partialSelections,
  isLoading,
  locale,
  currentBranch,
  stashes,
  conflicts,
  aheadCount,
  onFileClick,
  onToggleFile,
  onToggleAll,
  onDiscardFile,
  onConflictClick,
  onStash,
  onStashPop,
  onStashDrop,
}) => {
  const t = useCallback((key: string) => getTranslation(locale, key), [locale]);
  const {
    summary,
    description,
    isAmend,
    showPostCommit,
    lastCommitHash,
    setSummary,
    setDescription,
    setIsAmend,
    commitSelected,
    amendCommit,
    undoLastCommit,
    gitPush,
    dismissPostCommit,
  } = useGitStore();

  const [showStashes, setShowStashes] = useState(false);
  const [showDescription, setShowDescription] = useState(false);
  const [discardConfirm, setDiscardConfirm] = useState<string | null>(null);
  const summaryRef = useRef<HTMLInputElement>(null);

  const safeStashes = stashes ?? [];
  const safeConflicts = conflicts ?? [];
  const hasChanges = allFiles.length > 0;
  const checkedCount = checkedFiles.size;
  const allSelectionType = getAggregateSelectionType(allFiles, checkedFiles, partialSelections);
  const canCommit = checkedCount > 0 && summary.trim().length > 0 && safeConflicts.length === 0;

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter" && canCommit && !isLoading) {
        e.preventDefault();
        if (isAmend) amendCommit();
        else commitSelected();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [canCommit, isLoading, isAmend, commitSelected, amendCommit]);

  const handleCommit = useCallback(() => {
    if (isAmend) amendCommit();
    else commitSelected();
  }, [isAmend, amendCommit, commitSelected]);

  const handleDiscardClick = useCallback((path: string) => setDiscardConfirm(path), []);
  const handleConfirmDiscard = useCallback(() => {
    if (discardConfirm) {
      onDiscardFile(discardConfirm);
      setDiscardConfirm(null);
    }
  }, [discardConfirm, onDiscardFile]);

  return (
    <div className="flex flex-col h-full bg-ide-bg">
      <div className="flex-1 overflow-y-auto">
        {safeConflicts.length > 0 && (
          <div className="bg-red-500/10 border-b border-red-500/30 px-3 py-2 flex items-center gap-2">
            <AlertTriangle size={14} className="text-red-400 shrink-0" />
            <span className="text-xs text-red-400 font-medium flex-1">
              {safeConflicts.length} {t("git.conflicts")}
            </span>
          </div>
        )}

        {safeConflicts.length > 0 && (
          <div className="border-b border-ide-border">
            {safeConflicts.map((p) => (
              <div
                key={p}
                className="flex items-center gap-2 px-3 py-1.5 hover:bg-red-500/10 cursor-pointer"
                onClick={() => onConflictClick(p)}
              >
                <AlertTriangle size={12} className="text-red-400 shrink-0" />
                <span className="flex-1 text-xs text-red-400 truncate">{p}</span>
                <span className="text-[10px] bg-red-500/20 text-red-400 px-1.5 py-0.5 rounded">{t("git.resolve")}</span>
              </div>
            ))}
          </div>
        )}

        {!hasChanges && safeConflicts.length === 0 && (
          <div className="flex items-center justify-center h-32 text-ide-mute text-sm">{t("git.noChanges")}</div>
        )}

        {hasChanges && (
          <>
            <div className="flex items-center gap-2 px-3 py-2 border-b border-ide-border bg-ide-panel/30">
              <div className="flex items-center gap-2 flex-1 cursor-pointer" onClick={onToggleAll}>
                {renderSelectionIcon(
                  allSelectionType,
                  16,
                  allSelectionType === "none" ? "text-ide-mute shrink-0" : "text-ide-accent shrink-0"
                )}
                <span className="text-xs text-ide-mute font-medium flex-1">{t("git.selectAll")}</span>
                <span className="text-xs text-ide-mute">
                  {checkedCount}/{allFiles.length}
                </span>
              </div>
              <button
                className="p-1 hover:bg-purple-500/20 rounded text-ide-mute hover:text-purple-400 transition-colors shrink-0"
                onClick={() => onStash()}
                title={t("git.stashAll")}
              >
                <Archive size={14} />
              </button>
            </div>

            <div>
              {allFiles.map((file) => {
                const selectionType = getFileSelectionType(file.path, checkedFiles, partialSelections);
                return (
                  <div
                    key={file.path}
                    className={`flex items-center gap-2 px-3 py-1.5 cursor-pointer group transition-colors ${getFileRowClassName(selectionType)}`}
                  >
                    <div
                      onClick={(e) => {
                        e.stopPropagation();
                        onToggleFile(file.path);
                      }}
                      className="shrink-0"
                    >
                      {renderSelectionIcon(
                        selectionType,
                        16,
                        selectionType === "none" ? "text-ide-mute" : "text-ide-accent"
                      )}
                    </div>
                    <span className={`w-4 text-center font-bold text-[10px] shrink-0 ${getStatusColor(file.status)}`}>
                      {getStatusLabel(file.status)}
                    </span>
                    <div className="flex-1 min-w-0 flex flex-col" onClick={() => onFileClick(file.path)}>
                      <span className={getFileNameClassName(selectionType)}>{file.name}</span>
                      {file.path !== file.name && (
                        <span className={getFilePathClassName(selectionType)}>{file.path}</span>
                      )}
                    </div>
                    <button
                      className={`p-1 hover:bg-purple-500/20 rounded hover:text-purple-400 transition-opacity shrink-0 ${selectionType === "none" ? "text-ide-mute opacity-0 group-hover:opacity-100" : selectionType === "partial" ? "text-amber-300/80 opacity-100" : "text-ide-accent/80 opacity-100"}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        onStash(undefined, [file.path]);
                      }}
                      title={t("git.stashFile")}
                    >
                      <Archive size={12} />
                    </button>
                    {file.status !== "untracked" && (
                      <button
                        className={`p-1 hover:bg-red-500/20 rounded hover:text-red-400 transition-opacity shrink-0 ${selectionType === "none" ? "text-ide-mute opacity-0 group-hover:opacity-100" : selectionType === "partial" ? "text-amber-300/80 opacity-100" : "text-ide-accent/80 opacity-100"}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDiscardClick(file.path);
                        }}
                      >
                        <X size={12} />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      {safeStashes.length > 0 && (
        <div className="border-t border-ide-border">
          <div
            className="flex items-center justify-between px-3 py-1.5 bg-ide-panel/30 cursor-pointer"
            onClick={() => setShowStashes(!showStashes)}
          >
            <div className="flex items-center gap-1">
              {showStashes ? (
                <ChevronDown size={12} className="text-ide-mute" />
              ) : (
                <ChevronRight size={12} className="text-ide-mute" />
              )}
              <span className="text-[10px] font-bold text-ide-mute uppercase">{t("git.stashes")}</span>
            </div>
            <span className="text-[10px] bg-purple-500/20 text-purple-400 px-1.5 py-0.5 rounded">
              {safeStashes.length}
            </span>
          </div>
          {showStashes && (
            <div>
              {safeStashes.map((s) => (
                <div key={s.index} className="flex items-center gap-2 px-3 py-1.5 hover:bg-ide-accent/10 group">
                  <Archive size={12} className="text-purple-400 shrink-0" />
                  <span className="flex-1 text-[10px] text-ide-text truncate">{s.message}</span>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      className="px-1.5 py-0.5 text-[10px] bg-green-500/20 text-green-400 rounded hover:bg-green-500/30"
                      onClick={() => onStashPop(s.index)}
                    >
                      {t("git.pop")}
                    </button>
                    <button
                      className="px-1.5 py-0.5 text-[10px] bg-red-500/20 text-red-400 rounded hover:bg-red-500/30"
                      onClick={() => onStashDrop(s.index)}
                    >
                      {t("git.drop")}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="shrink-0 border-t border-ide-border bg-ide-panel/30 p-3 space-y-2">
        {showPostCommit && lastCommitHash && (
          <div className="flex items-center gap-2 bg-green-500/10 border border-green-500/30 rounded px-3 py-1.5">
            <Check size={14} className="text-green-400 shrink-0" />
            <span className="text-xs text-green-400 flex-1 truncate">{lastCommitHash.substring(0, 7)}</span>
            <button
              className="px-2 py-0.5 text-[10px] bg-ide-accent/20 text-ide-accent rounded hover:bg-ide-accent/30 flex items-center gap-1"
              onClick={undoLastCommit}
            >
              <Undo2 size={10} />
              {t("git.undo")}
            </button>
            {aheadCount > 0 && (
              <button
                className="px-2 py-0.5 text-[10px] bg-blue-500/20 text-blue-400 rounded hover:bg-blue-500/30 flex items-center gap-1"
                onClick={gitPush}
              >
                <ArrowUp size={10} />
                {t("git.push")} ({aheadCount})
              </button>
            )}
            <button className="text-ide-mute hover:text-ide-text" onClick={dismissPostCommit}>
              <X size={12} />
            </button>
          </div>
        )}

        <input
          ref={summaryRef}
          type="text"
          placeholder={t("git.summaryPlaceholder")}
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          className="w-full bg-ide-bg border border-ide-border rounded px-3 py-2 text-sm text-ide-text focus:outline-none focus:border-ide-accent placeholder-ide-mute/50"
        />

        {showDescription ? (
          <textarea
            placeholder={t("git.descriptionPlaceholder")}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full bg-ide-bg border border-ide-border rounded px-3 py-2 text-xs text-ide-text focus:outline-none focus:border-ide-accent min-h-[48px] resize-none placeholder-ide-mute/50"
          />
        ) : (
          <button className="text-[10px] text-ide-mute hover:text-ide-accent" onClick={() => setShowDescription(true)}>
            + {t("git.descriptionPlaceholder")}
          </button>
        )}

        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={isAmend}
            onChange={(e) => setIsAmend(e.target.checked)}
            className="accent-ide-accent w-3.5 h-3.5"
          />
          <span className="text-[10px] text-ide-mute">{t("git.amend")}</span>
        </label>

        <button
          disabled={!canCommit || isLoading}
          onClick={handleCommit}
          className="w-full bg-ide-accent text-ide-bg font-bold py-2 text-sm flex items-center justify-center gap-2 rounded disabled:opacity-50 disabled:cursor-not-allowed hover:bg-ide-accent/80 transition-colors"
          title={t("git.commitShortcut")}
        >
          <Check size={14} />
          {t("git.commitTo")} {currentBranch}
          {checkedCount > 0 && <span className="text-xs opacity-80">({checkedCount})</span>}
        </button>
      </div>

      {discardConfirm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          onClick={() => setDiscardConfirm(null)}
        >
          <div
            className="bg-ide-bg border border-ide-border rounded-lg shadow-xl w-80 p-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2 mb-3">
              <AlertTriangle size={20} className="text-red-400" />
              <span className="text-sm font-medium text-ide-text">{t("git.discardConfirm")}</span>
            </div>
            <p className="text-xs text-ide-mute mb-2 font-mono bg-ide-panel px-2 py-1 rounded truncate">
              {discardConfirm}
            </p>
            <p className="text-xs text-red-400 mb-4">{t("git.discardWarning")}</p>
            <div className="flex gap-2">
              <button
                onClick={() => setDiscardConfirm(null)}
                className="flex-1 px-3 py-1.5 text-sm text-ide-mute hover:text-ide-text border border-ide-border rounded"
              >
                {t("git.cancel")}
              </button>
              <button
                onClick={handleConfirmDiscard}
                className="flex-1 px-3 py-1.5 text-sm bg-red-500 text-white rounded hover:bg-red-600"
              >
                {t("git.confirm")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default GitChangesView;
