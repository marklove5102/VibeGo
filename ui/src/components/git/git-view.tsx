import { ArrowDown, ArrowUp, CloudUpload, FileText, GitBranch, GitGraph, History, RefreshCw } from "lucide-react";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { GitCommit } from "@/api/git";
import { gitApi } from "@/api/git";
import { usePageTopBar } from "@/hooks/use-page-top-bar";
import { getTranslation, type Locale } from "@/lib/i18n";
import { useGitStore } from "@/stores";
import BranchSelector from "./branch-selector";
import GitChangesView from "./git-changes-view";
import GitHistoryView from "./git-history-view";

interface GitDiffRequest {
  original: string;
  modified: string;
  title: string;
  filename?: string;
  filePath?: string;
  repoPath?: string;
  allowSelection?: boolean;
}

interface GitViewProps {
  path: string;
  locale: Locale;
  onFileDiff: (payload: GitDiffRequest) => void;
  onConflict?: (repoPath: string, filePath: string) => void;
  isActive?: boolean;
}

const GitView: React.FC<GitViewProps> = ({ path, locale, onFileDiff, onConflict, isActive = true }) => {
  const t = (key: string) => getTranslation(locale, key);
  const [showBranchSelector, setShowBranchSelector] = useState(false);

  const {
    currentPath: currentRepoPath,
    allFiles,
    checkedFiles,
    partialSelections,
    commits,
    isLoading,
    selectedCommit,
    selectedCommitFiles,
    currentBranch,
    branches,
    remoteBranches,
    activeTab,
    hasRemote,
    aheadCount,
    behindCount,
    stashes,
    conflicts,
    setCurrentPath,
    setActiveTab,
    reset,
    fetchStatus,
    fetchLog,
    fetchBranches,
    fetchRemotes,
    fetchBranchStatus,
    fetchStashes,
    fetchConflicts,
    smartSwitchBranch,
    gitPull,
    gitPush,
    gitFetch,
    stash,
    stashPop,
    stashDrop,
    createBranch,
    deleteBranch,
    getDiff,
    setSelectedCommit,
    getCommitFiles,
    getCommitDiff,
    toggleFile,
    toggleAllFiles,
    discardFile,
    applyStatusUpdate,
    applyBranchStatus,
  } = useGitStore();

  const initializedRef = useRef(false);
  const wsCleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    const pathChanged = currentRepoPath !== path;
    if (pathChanged) {
      reset();
      setCurrentPath(path);
      initializedRef.current = false;
    }
    if (!initializedRef.current) {
      initializedRef.current = true;
      fetchStatus();
      fetchLog();
      fetchBranches();
      fetchRemotes();
      fetchBranchStatus();
      fetchStashes();
      fetchConflicts();
    }
  }, [
    path,
    currentRepoPath,
    setCurrentPath,
    reset,
    fetchStatus,
    fetchLog,
    fetchBranches,
    fetchRemotes,
    fetchBranchStatus,
    fetchStashes,
    fetchConflicts,
  ]);

  useEffect(() => {
    if (!path || !isActive) return;
    wsCleanupRef.current = gitApi.connectWs(path, (event) => {
      if (event.type === "file_changed" && event.data.files) {
        applyStatusUpdate(event.data.files as any);
      }
      if (event.type === "remote_updated") {
        applyBranchStatus(event.data as any);
      }
    });
    return () => {
      wsCleanupRef.current?.();
      wsCleanupRef.current = null;
    };
  }, [path, isActive, applyStatusUpdate, applyBranchStatus]);

  const handleRefresh = useCallback(() => {
    fetchStatus();
    fetchBranchStatus();
    if (activeTab === "history") fetchLog();
  }, [fetchStatus, fetchBranchStatus, fetchLog, activeTab]);

  const smartAction = useMemo(() => {
    if (!hasRemote) return { label: t("git.publish"), icon: <CloudUpload size={14} />, action: gitPush };
    if (behindCount > 0)
      return { label: `${t("git.pull")} (${behindCount})`, icon: <ArrowDown size={14} />, action: gitPull };
    if (aheadCount > 0)
      return { label: `${t("git.push")} (${aheadCount})`, icon: <ArrowUp size={14} />, action: gitPush };
    return { label: t("git.fetch"), icon: <RefreshCw size={14} />, action: gitFetch };
  }, [hasRemote, aheadCount, behindCount, gitPull, gitPush, gitFetch, t]);

  const topBarConfig = useMemo(() => {
    if (!isActive) return null;
    return {
      show: true,
      leftButtons: [{ icon: <GitGraph size={18} /> }],
      centerContent: (
        <div className="flex items-center gap-1 h-full">
          <div
            onClick={() => setActiveTab("changes")}
            className={`shrink-0 px-2.5 h-7 rounded-md flex items-center gap-1 text-xs border transition-all cursor-pointer ${
              activeTab === "changes"
                ? "bg-ide-panel border-ide-accent text-ide-accent border-b-2 shadow-sm"
                : "bg-transparent border-transparent text-ide-mute hover:bg-ide-panel hover:text-ide-text"
            }`}
          >
            <FileText size={12} />
            <span className="font-medium">
              {t("git.changes")}
              {allFiles.length > 0 && ` (${allFiles.length})`}
            </span>
          </div>
          <div
            onClick={() => setActiveTab("history")}
            className={`shrink-0 px-2.5 h-7 rounded-md flex items-center gap-1 text-xs border transition-all cursor-pointer ${
              activeTab === "history"
                ? "bg-ide-panel border-ide-accent text-ide-accent border-b-2 shadow-sm"
                : "bg-transparent border-transparent text-ide-mute hover:bg-ide-panel hover:text-ide-text"
            }`}
          >
            <History size={12} />
            <span className="font-medium">{t("git.history")}</span>
          </div>
        </div>
      ),
      rightButtons: [
        {
          icon: <RefreshCw size={16} className={isLoading ? "animate-spin" : ""} />,
          onClick: handleRefresh,
          disabled: isLoading,
        },
      ],
    };
  }, [isActive, activeTab, allFiles.length, isLoading, t, setActiveTab, handleRefresh]);

  usePageTopBar(topBarConfig, [topBarConfig]);

  const handleFileClick = useCallback(
    async (filePath: string) => {
      const diff = await getDiff(filePath);
      if (diff) {
        const file = allFiles.find((item) => item.path === filePath);
        const fileName = filePath.split("/").pop() || filePath;
        onFileDiff({
          original: diff.old,
          modified: diff.new,
          title: `${fileName} [DIFF]`,
          filename: fileName,
          filePath,
          repoPath: path,
          allowSelection: file ? ["modified", "added", "untracked"].includes(file.status) : false,
        });
      }
    },
    [allFiles, getDiff, onFileDiff, path]
  );

  const handleCommitSelect = useCallback(
    async (commitInfo: GitCommit) => {
      setSelectedCommit(commitInfo);
      await getCommitFiles(commitInfo.hash);
    },
    [setSelectedCommit, getCommitFiles]
  );

  const handleHistoryFileClick = useCallback(
    async (commitInfo: GitCommit, filePath: string) => {
      const diff = await getCommitDiff(commitInfo.hash, filePath);
      if (diff) {
        const fileName = filePath.split("/").pop() || filePath;
        const shortHash = commitInfo.hash.substring(0, 7);
        onFileDiff({
          original: diff.old,
          modified: diff.new,
          title: `${fileName} @ ${shortHash}`,
          filename: fileName,
          filePath,
          repoPath: path,
          allowSelection: false,
        });
      }
    },
    [getCommitDiff, onFileDiff, path]
  );

  const handleConflictClick = useCallback(
    (conflictPath: string) => {
      onConflict?.(path, conflictPath);
    },
    [path, onConflict]
  );

  return (
    <>
      <div className="flex flex-col h-full bg-ide-bg">
        <div className="h-9 flex items-center gap-2 px-3 bg-ide-panel border-b border-ide-border shrink-0">
          <button
            className="flex items-center gap-1.5 px-2 py-1 rounded text-xs text-ide-text hover:bg-ide-accent/10 active:bg-ide-accent/15 transition-colors min-w-0"
            onClick={() => setShowBranchSelector(true)}
            disabled={branches.length === 0}
          >
            <GitBranch size={14} className="text-ide-accent shrink-0" />
            <span className="truncate max-w-[120px]">{currentBranch || "branch"}</span>
            {(aheadCount > 0 || behindCount > 0) && (
              <span className="flex items-center gap-1 shrink-0">
                {aheadCount > 0 && (
                  <span className="text-[10px] text-blue-400">
                    {aheadCount}
                    <ArrowUp size={8} className="inline" />
                  </span>
                )}
                {behindCount > 0 && (
                  <span className="text-[10px] text-orange-400">
                    {behindCount}
                    <ArrowDown size={8} className="inline" />
                  </span>
                )}
              </span>
            )}
          </button>
          <div className="flex-1" />
          {(hasRemote || aheadCount > 0) && (
            <button
              className="flex items-center gap-1.5 px-2 py-1 rounded text-xs text-ide-accent hover:bg-ide-accent/10 active:bg-ide-accent/15 transition-colors disabled:opacity-50 shrink-0"
              onClick={smartAction.action}
              disabled={isLoading}
            >
              {smartAction.icon}
              <span>{smartAction.label}</span>
            </button>
          )}
        </div>

        <div className="flex-1 overflow-hidden">
          {activeTab === "changes" ? (
            <GitChangesView
              allFiles={allFiles}
              checkedFiles={checkedFiles}
              partialSelections={partialSelections}
              isLoading={isLoading}
              locale={locale}
              currentBranch={currentBranch}
              stashes={stashes}
              conflicts={conflicts}
              aheadCount={aheadCount}
              onFileClick={handleFileClick}
              onToggleFile={toggleFile}
              onToggleAll={toggleAllFiles}
              onDiscardFile={discardFile}
              onConflictClick={handleConflictClick}
              onStash={stash}
              onStashPop={stashPop}
              onStashDrop={stashDrop}
            />
          ) : (
            <GitHistoryView
              commits={commits}
              isLoading={isLoading}
              locale={locale}
              onCommitSelect={handleCommitSelect}
              onFileClick={handleHistoryFileClick}
              selectedCommitFiles={selectedCommitFiles}
              selectedCommitHash={selectedCommit?.hash || null}
            />
          )}
        </div>
      </div>
      <BranchSelector
        isOpen={showBranchSelector}
        branches={branches}
        remoteBranches={remoteBranches}
        currentBranch={currentBranch}
        aheadCount={aheadCount}
        behindCount={behindCount}
        locale={locale}
        onClose={() => setShowBranchSelector(false)}
        onSwitch={smartSwitchBranch}
        onCreate={createBranch}
        onDelete={deleteBranch}
      />
    </>
  );
};

export default GitView;
