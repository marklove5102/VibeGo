import { AlertTriangle, Archive, Check, ChevronDown, ChevronRight, FileText, Minus, Plus, X } from "lucide-react";
import React, { useCallback, useEffect, useState } from "react";
import type { StashEntry } from "@/api/git";
import type { GitFileNode, Locale } from "@/stores";

interface GitChangesViewProps {
  stagedFiles: GitFileNode[];
  unstagedFiles: GitFileNode[];
  commitMessage: string;
  isLoading: boolean;
  locale: Locale;
  stashes: StashEntry[];
  conflicts: string[];
  onFileClick: (file: GitFileNode) => void;
  onStageFile: (path: string) => void;
  onUnstageFile: (path: string) => void;
  onDiscardFile: (path: string) => void;
  onStageAll: () => void;
  onUnstageAll: () => void;
  onCommitMessageChange: (msg: string) => void;
  onCommit: () => void;
  onStash: () => void;
  onStashPop: (index: number) => void;
  onStashDrop: (index: number) => void;
  onConflictClick: (path: string) => void;
}

const i18n = {
  en: {
    staged: "Staged Changes",
    unstaged: "Changes",
    stageAll: "Stage All",
    unstageAll: "Unstage All",
    noChanges: "No changes",
    commitPlaceholder: "Commit message...",
    commit: "Commit",
    stage: "Stage",
    unstage: "Unstage",
    discard: "Discard",
    stash: "Stash",
    stashes: "Stashes",
    pop: "Pop",
    drop: "Drop",
    conflicts: "Conflicts",
    resolve: "Resolve",
    discardConfirm: "Discard changes to",
    discardWarning: "This will permanently discard your changes. This cannot be undone.",
    cancel: "Cancel",
    confirm: "Discard",
  },
  zh: {
    staged: "已暂存",
    unstaged: "更改",
    stageAll: "全部暂存",
    unstageAll: "取消全部",
    noChanges: "没有更改",
    commitPlaceholder: "提交信息...",
    commit: "提交",
    stage: "暂存",
    unstage: "取消暂存",
    discard: "放弃",
    stash: "贮藏",
    stashes: "贮藏列表",
    pop: "恢复",
    drop: "删除",
    conflicts: "冲突",
    resolve: "解决",
    discardConfirm: "放弃对以下文件的更改",
    discardWarning: "此操作将永久丢弃您的更改，且无法撤销。",
    cancel: "取消",
    confirm: "放弃",
  },
};

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

interface FileItemProps {
  file: GitFileNode;
  locale: Locale;
  onFileClick: (file: GitFileNode) => void;
  onAction: () => void;
  onSecondaryAction?: () => void;
  actionIcon: React.ReactNode;
  secondaryActionIcon?: React.ReactNode;
}

const FileItem: React.FC<FileItemProps> = ({
  file,
  onFileClick,
  onAction,
  onSecondaryAction,
  actionIcon,
  secondaryActionIcon,
}) => {
  const handleClick = useCallback(() => {
    onFileClick(file);
  }, [file, onFileClick]);

  const handleAction = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onAction();
    },
    [onAction]
  );

  const handleSecondaryAction = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onSecondaryAction?.();
    },
    [onSecondaryAction]
  );

  return (
    <div
      className="flex items-center gap-2 px-3 py-1 hover:bg-ide-accent/10 cursor-pointer group transition-colors"
      onClick={handleClick}
    >
      <span className={`w-4 text-center font-bold text-[10px] ${getStatusColor(file.status)}`}>
        {getStatusLabel(file.status)}
      </span>
      <FileText size={14} className="text-ide-mute shrink-0" />
      <div className="flex-1 min-w-0 flex flex-col justify-center">
        <div className="text-xs text-ide-text truncate group-hover:text-ide-accent leading-tight">{file.name}</div>
        <div className="text-[10px] text-ide-mute/70 truncate leading-tight">{file.path}</div>
      </div>
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        {secondaryActionIcon && onSecondaryAction && (
          <button
            className="p-1 hover:bg-ide-accent/20 rounded text-red-400 hover:text-red-300"
            onClick={handleSecondaryAction}
          >
            {secondaryActionIcon}
          </button>
        )}
        <button className="p-1 hover:bg-ide-accent/20 rounded text-ide-accent" onClick={handleAction}>
          {actionIcon}
        </button>
      </div>
      <ChevronRight size={14} className="text-ide-mute" />
    </div>
  );
};

const GitChangesView: React.FC<GitChangesViewProps> = ({
  stagedFiles,
  unstagedFiles,
  commitMessage,
  isLoading,
  locale,
  stashes,
  conflicts,
  onFileClick,
  onStageFile,
  onUnstageFile,
  onDiscardFile,
  onStageAll,
  onUnstageAll,
  onCommitMessageChange,
  onCommit,
  onStash,
  onStashPop,
  onStashDrop,
  onConflictClick,
}) => {
  const t = i18n[locale] || i18n.en;
  const [showStashes, setShowStashes] = useState(false);
  const [discardConfirm, setDiscardConfirm] = useState<string | null>(null);
  const safeStashes = stashes ?? [];
  const safeConflicts = conflicts ?? [];
  const hasChanges = stagedFiles.length > 0 || unstagedFiles.length > 0;
  const canCommit = stagedFiles.length > 0 && commitMessage.trim().length > 0 && safeConflicts.length === 0;
  const canStash = hasChanges;

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter" && canCommit && !isLoading) {
        e.preventDefault();
        onCommit();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [canCommit, isLoading, onCommit]);

  const handleDiscardClick = useCallback((path: string) => {
    setDiscardConfirm(path);
  }, []);

  const handleConfirmDiscard = useCallback(() => {
    if (discardConfirm) {
      onDiscardFile(discardConfirm);
      setDiscardConfirm(null);
    }
  }, [discardConfirm, onDiscardFile]);

  return (
    <div className="flex flex-col h-full bg-ide-bg">
      <div className="flex-1 overflow-y-auto">
        {!hasChanges && safeConflicts.length === 0 && (
          <div className="flex items-center justify-center h-32 text-ide-mute text-sm">{t.noChanges}</div>
        )}

        {safeConflicts.length > 0 && (
          <div className="border-b border-ide-border">
            <div className="flex items-center justify-between px-3 py-2 bg-red-500/10">
              <div className="flex items-center gap-1">
                <AlertTriangle size={14} className="text-red-400" />
                <span className="text-xs font-bold text-red-400 uppercase">{t.conflicts}</span>
              </div>
              <span className="text-xs bg-red-500/20 text-red-400 px-1.5 py-0.5 rounded">
                {safeConflicts.length}
              </span>
            </div>
            <div className="divide-y divide-ide-border/50">
              {safeConflicts.map((path) => (
                <div
                  key={path}
                  className="flex items-center gap-2 px-3 py-1.5 hover:bg-ide-accent/10 cursor-pointer group"
                  onClick={() => onConflictClick(path)}
                >
                  <AlertTriangle size={14} className="text-red-400 shrink-0" />
                  <span className="flex-1 text-xs text-ide-text truncate">{path}</span>
                  <button className="px-2 py-0.5 text-[10px] bg-ide-accent/20 text-ide-accent rounded hover:bg-ide-accent/30 opacity-0 group-hover:opacity-100 transition-opacity">
                    {t.resolve}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {unstagedFiles.length > 0 && (
          <div className="border-b border-ide-border">
            <div className="flex items-center justify-between px-3 py-2 bg-ide-panel/50">
              <span className="text-xs font-bold text-ide-mute uppercase">{t.unstaged}</span>
              <div className="flex items-center gap-2">
                <span className="text-xs bg-yellow-500/20 text-yellow-400 px-1.5 py-0.5 rounded">
                  {unstagedFiles.length}
                </span>
                <button className="text-xs text-ide-accent hover:underline" onClick={onStageAll}>
                  {t.stageAll}
                </button>
              </div>
            </div>
            <div className="divide-y divide-ide-border/50">
              {unstagedFiles.map((file) => (
                <FileItem
                  key={file.id}
                  file={file}
                  locale={locale}
                  onFileClick={onFileClick}
                  onAction={() => onStageFile(file.path)}
                  onSecondaryAction={file.status !== "untracked" ? () => handleDiscardClick(file.path) : undefined}
                  actionIcon={<Plus size={14} />}
                  secondaryActionIcon={file.status !== "untracked" ? <X size={14} /> : undefined}
                />
              ))}
            </div>
          </div>
        )}

        {stagedFiles.length > 0 && (
          <div className="border-b border-ide-border">
            <div className="flex items-center justify-between px-3 py-2 bg-ide-panel/50">
              <span className="text-xs font-bold text-ide-mute uppercase">{t.staged}</span>
              <div className="flex items-center gap-2">
                <span className="text-xs bg-green-500/20 text-green-400 px-1.5 py-0.5 rounded">
                  {stagedFiles.length}
                </span>
                <button className="text-xs text-ide-accent hover:underline" onClick={onUnstageAll}>
                  {t.unstageAll}
                </button>
              </div>
            </div>
            <div className="divide-y divide-ide-border/50">
              {stagedFiles.map((file) => (
                <FileItem
                  key={file.id}
                  file={file}
                  locale={locale}
                  onFileClick={onFileClick}
                  onAction={() => onUnstageFile(file.path)}
                  actionIcon={<Minus size={14} />}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {safeStashes.length > 0 && (
        <div className="border-b border-ide-border">
          <div
            className="flex items-center justify-between px-3 py-2 bg-ide-panel/50 cursor-pointer"
            onClick={() => setShowStashes(!showStashes)}
          >
            <div className="flex items-center gap-1">
              {showStashes ? <ChevronDown size={14} className="text-ide-mute" /> : <ChevronRight size={14} className="text-ide-mute" />}
              <span className="text-xs font-bold text-ide-mute uppercase">{t.stashes}</span>
            </div>
            <span className="text-xs bg-purple-500/20 text-purple-400 px-1.5 py-0.5 rounded">
              {safeStashes.length}
            </span>
          </div>
          {showStashes && (
            <div className="divide-y divide-ide-border/50">
              {safeStashes.map((stash) => (
                <div key={stash.index} className="flex items-center gap-2 px-3 py-2 hover:bg-ide-accent/10 group">
                  <Archive size={14} className="text-purple-400 shrink-0" />
                  <span className="flex-1 text-xs text-ide-text truncate">{stash.message}</span>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      className="px-2 py-0.5 text-[10px] bg-green-500/20 text-green-400 rounded hover:bg-green-500/30"
                      onClick={() => onStashPop(stash.index)}
                    >
                      {t.pop}
                    </button>
                    <button
                      className="px-2 py-0.5 text-[10px] bg-red-500/20 text-red-400 rounded hover:bg-red-500/30"
                      onClick={() => onStashDrop(stash.index)}
                    >
                      {t.drop}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="shrink-0 border-t border-ide-border bg-ide-panel/30 p-3 space-y-2">
        <textarea
          placeholder={t.commitPlaceholder}
          value={commitMessage}
          onChange={(e) => onCommitMessageChange(e.target.value)}
          className="w-full bg-ide-bg border border-ide-border rounded px-3 py-2 text-sm text-ide-text focus:outline-none focus:border-ide-accent min-h-[60px] resize-none placeholder-ide-mute/50"
        />
        <div className="flex gap-2">
          <button
            disabled={!canCommit || isLoading}
            onClick={onCommit}
            className="flex-1 bg-ide-accent text-ide-bg font-bold py-2 text-sm flex items-center justify-center gap-2 rounded disabled:opacity-50 disabled:cursor-not-allowed hover:bg-ide-accent/80 transition-colors"
            title="Ctrl+Enter"
          >
            <Check size={14} />
            {t.commit}
            {stagedFiles.length > 0 && <span className="text-xs opacity-80">({stagedFiles.length})</span>}
          </button>
          <button
            disabled={!canStash || isLoading}
            onClick={onStash}
            className="px-3 py-2 bg-purple-500/20 text-purple-400 font-bold text-sm flex items-center justify-center gap-1 rounded disabled:opacity-50 disabled:cursor-not-allowed hover:bg-purple-500/30 transition-colors"
            title={t.stash}
          >
            <Archive size={14} />
          </button>
        </div>
      </div>

      {discardConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setDiscardConfirm(null)}>
          <div
            className="bg-ide-bg border border-ide-border rounded-lg shadow-xl w-80 p-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2 mb-3">
              <AlertTriangle size={20} className="text-red-400" />
              <span className="text-sm font-medium text-ide-text">{t.discardConfirm}</span>
            </div>
            <p className="text-xs text-ide-mute mb-2 font-mono bg-ide-panel px-2 py-1 rounded truncate">
              {discardConfirm}
            </p>
            <p className="text-xs text-red-400 mb-4">{t.discardWarning}</p>
            <div className="flex gap-2">
              <button
                onClick={() => setDiscardConfirm(null)}
                className="flex-1 px-3 py-1.5 text-sm text-ide-mute hover:text-ide-text border border-ide-border rounded"
              >
                {t.cancel}
              </button>
              <button
                onClick={handleConfirmDiscard}
                className="flex-1 px-3 py-1.5 text-sm bg-red-500 text-white rounded hover:bg-red-600"
              >
                {t.confirm}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default GitChangesView;
