import {
  AlertTriangle,
  Archive,
  ArrowDown,
  ArrowUp,
  Check,
  ChevronDown,
  ChevronRight,
  CloudUpload,
  Loader2,
  RefreshCw,
  Search,
  Square,
  SquareCheck,
  SquareMinus,
  Undo2,
  X,
} from "lucide-react";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { StashEntry } from "@/api/git";
import { getTranslation, type Locale } from "@/lib/i18n";
import type { GitFileNode, GitPartialSelection } from "@/stores";
import { useGitStore } from "@/stores";

type FileSelectionType = "all" | "partial" | "none";

interface GitChangesViewProps {
  groupId: string;
  allFiles: GitFileNode[];
  checkedFiles: Set<string>;
  partialSelections: Record<string, GitPartialSelection>;
  isLoading: boolean;
  locale: Locale;
  currentBranch: string;
  stashes: StashEntry[];
  conflicts: string[];
  hasRemote: boolean;
  aheadCount: number;
  behindCount: number;
  onFileClick: (path: string) => void;
  onToggleFile: (path: string) => void;
  onToggleAll: () => void;
  onDiscardFile: (path: string) => void;
  onConflictClick: (path: string) => void;
  onStash: (message?: string, files?: string[]) => void;
  onStashPop: (index: number) => void;
  onStashDrop: (index: number) => void;
  onPull: () => void;
  onPush: () => void;
  onFetch: () => void;
  onUndoLastCommit: () => Promise<boolean>;
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
  groupId,
  allFiles,
  checkedFiles,
  partialSelections,
  isLoading,
  locale,
  currentBranch,
  stashes,
  conflicts,
  hasRemote,
  aheadCount,
  behindCount,
  onFileClick,
  onToggleFile,
  onToggleAll,
  onDiscardFile,
  onConflictClick,
  onStash,
  onStashPop,
  onStashDrop,
  onPull,
  onPush,
  onFetch,
  onUndoLastCommit,
}) => {
  const t = useCallback((key: string) => getTranslation(locale, key), [locale]);
  const { summary, description, isAmend, setSummary, setDescription, setIsAmend, commitSelected, amendCommit } =
    useGitStore(groupId);

  const [showStashes, setShowStashes] = useState(false);
  const [showDescription, setShowDescription] = useState(false);
  const [discardConfirm, setDiscardConfirm] = useState<string | null>(null);
  const [filterText, setFilterText] = useState("");
  const [undoToast, setUndoToast] = useState(false);
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const summaryRef = useRef<HTMLInputElement>(null);

  const safeStashes = stashes ?? [];
  const safeConflicts = conflicts ?? [];
  const hasChanges = allFiles.length > 0;
  const showFilter = allFiles.length > 5;
  const filteredFiles = useMemo(() => {
    if (!filterText.trim()) return allFiles;
    const lower = filterText.toLowerCase();
    return allFiles.filter((f) => f.path.toLowerCase().includes(lower) || f.name.toLowerCase().includes(lower));
  }, [allFiles, filterText]);
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

  const handleCommit = useCallback(async () => {
    const ok = isAmend ? await amendCommit() : await commitSelected();
    if (ok) {
      if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
      setUndoToast(true);
      undoTimerRef.current = setTimeout(() => setUndoToast(false), 5000);
    }
  }, [isAmend, amendCommit, commitSelected]);

  const handleUndoFromToast = useCallback(async () => {
    setUndoToast(false);
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    await onUndoLastCommit();
  }, [onUndoLastCommit]);

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
          <div className="flex flex-col gap-2 p-3">
            <div className="text-center text-ide-mute text-sm py-4">{t("git.noChanges")}</div>
            {!hasRemote && (
              <button
                onClick={onPush}
                disabled={isLoading}
                className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-ide-accent/10 border border-ide-accent/20 hover:bg-ide-accent/15 transition-colors disabled:opacity-50 text-left"
              >
                <CloudUpload size={16} className="text-ide-accent shrink-0" />
                <span className="text-xs text-ide-accent font-medium">{t("git.publish")}</span>
              </button>
            )}
            {hasRemote && behindCount > 0 && (
              <button
                onClick={onPull}
                disabled={isLoading}
                className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-orange-500/10 border border-orange-500/20 hover:bg-orange-500/15 transition-colors disabled:opacity-50 text-left"
              >
                <ArrowDown size={16} className="text-orange-400 shrink-0" />
                <span className="text-xs text-orange-400 font-medium">{t("git.pull")} ({behindCount})</span>
              </button>
            )}
            {hasRemote && aheadCount > 0 && (
              <button
                onClick={onPush}
                disabled={isLoading}
                className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-blue-500/10 border border-blue-500/20 hover:bg-blue-500/15 transition-colors disabled:opacity-50 text-left"
              >
                <ArrowUp size={16} className="text-blue-400 shrink-0" />
                <span className="text-xs text-blue-400 font-medium">{t("git.push")} ({aheadCount})</span>
              </button>
            )}
            {hasRemote && aheadCount === 0 && behindCount === 0 && (
              <button
                onClick={onFetch}
                disabled={isLoading}
                className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-ide-panel border border-ide-border hover:bg-ide-accent/10 transition-colors disabled:opacity-50 text-left"
              >
                <RefreshCw size={16} className="text-ide-mute shrink-0" />
                <span className="text-xs text-ide-text font-medium">{t("git.fetch")}</span>
              </button>
            )}
            {safeStashes.length > 0 && (
              <button
                onClick={() => onStashPop(safeStashes[0].index)}
                disabled={isLoading}
                className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-purple-500/10 border border-purple-500/20 hover:bg-purple-500/15 transition-colors disabled:opacity-50 text-left"
              >
                <Archive size={16} className="text-purple-400 shrink-0" />
                <div className="flex flex-col min-w-0">
                  <span className="text-xs text-purple-400 font-medium">{t("git.stashes")} ({safeStashes.length})</span>
                  <span className="text-[10px] text-purple-400/70 truncate">{safeStashes[0].message}</span>
                </div>
              </button>
            )}
          </div>
        )}

        {hasChanges && (
          <>
            {showFilter && (
              <div className="px-3 py-1.5 border-b border-ide-border bg-ide-panel/30">
                <div className="flex items-center gap-1.5 bg-ide-bg border border-ide-border rounded px-2 py-1">
                  <Search size={12} className="text-ide-mute shrink-0" />
                  <input
                    type="text"
                    value={filterText}
                    onChange={(e) => setFilterText(e.target.value)}
                    placeholder={t("git.searchFiles")}
                    className="flex-1 bg-transparent text-xs text-ide-text placeholder-ide-mute/50 focus:outline-none min-w-0"
                  />
                  {filterText && (
                    <button onClick={() => setFilterText("")} className="text-ide-mute hover:text-ide-text">
                      <X size={12} />
                    </button>
                  )}
                </div>
              </div>
            )}

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
              {filteredFiles.map((file) => {
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
              {filterText && filteredFiles.length === 0 && (
                <div className="flex items-center justify-center py-6 text-ide-mute text-xs">
                  {t("git.noChanges")}
                </div>
              )}
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
        <div className="relative">
          <input
            ref={summaryRef}
            type="text"
            placeholder={t("git.summaryPlaceholder")}
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            className={`w-full bg-ide-bg border rounded px-3 py-2 text-sm text-ide-text focus:outline-none placeholder-ide-mute/50 ${
              summary.length > 72
                ? "border-yellow-500/50 focus:border-yellow-500"
                : "border-ide-border focus:border-ide-accent"
            }`}
          />
          {summary.length > 0 && (
            <span
              className={`absolute right-2 top-1/2 -translate-y-1/2 text-[10px] ${
                summary.length > 72 ? "text-yellow-500" : "text-ide-mute/50"
              }`}
            >
              {summary.length}
            </span>
          )}
        </div>

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
          {isLoading ? (
            <>
              <Loader2 size={14} className="animate-spin" />
              {t("common.loading")}
            </>
          ) : (
            <>
              <Check size={14} />
              {t("git.commitTo")} {currentBranch}
              {checkedCount > 0 && <span className="text-xs opacity-80">({checkedCount})</span>}
            </>
          )}
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

      {undoToast && (
        <div className="absolute bottom-20 left-3 right-3 z-50 animate-in slide-in-from-bottom-4 fade-in duration-300">
          <div className="flex items-center gap-2 bg-green-500/15 border border-green-500/30 rounded-lg px-3 py-2 shadow-lg backdrop-blur-sm">
            <Check size={14} className="text-green-400 shrink-0" />
            <span className="flex-1 text-xs text-green-400 font-medium">{t("git.commit")}</span>
            <button
              onClick={handleUndoFromToast}
              className="flex items-center gap-1 px-2 py-0.5 rounded text-xs text-ide-accent hover:bg-ide-accent/10 font-medium"
            >
              <Undo2 size={10} />
              {t("git.undo")}
            </button>
            <button onClick={() => setUndoToast(false)} className="text-ide-mute hover:text-ide-text">
              <X size={12} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default GitChangesView;
