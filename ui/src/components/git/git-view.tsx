import { ArrowDown, ArrowUp, CloudUpload, GitBranch, History, FileText, RefreshCw } from "lucide-react";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { GitCommit } from "@/api/git";
import { gitApi } from "@/api/git";
import { usePageTopBar } from "@/hooks/use-page-top-bar";
import { type Locale } from "@/lib/i18n";
import { useGitStore } from "@/stores";
import BranchSelector from "./branch-selector";
import GitChangesView from "./git-changes-view";
import GitHistoryView from "./git-history-view";

interface GitViewProps {
  path: string;
  locale: Locale;
  onFileDiff: (original: string, modified: string, title: string, filename?: string) => void;
  onConflict?: (repoPath: string, filePath: string) => void;
  isActive?: boolean;
}

const i18n = {
  en: { changes: "Changes", history: "History" },
  zh: { changes: "Changes", history: "History" },
};

const GitView: React.FC<GitViewProps> = ({ path, locale, onFileDiff, onConflict, isActive = true }) => {
  const t = i18n[locale] || i18n.en;
  const [showBranchSelector, setShowBranchSelector] = useState(false);

  const {
    currentPath: currentRepoPath,
    allFiles,
    checkedFiles,
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
  }, [path, currentRepoPath, setCurrentPath, reset, fetchStatus, fetchLog, fetchBranches, fetchRemotes, fetchBranchStatus, fetchStashes, fetchConflicts]);

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
    if (!hasRemote) return { label: "Publish", icon: <CloudUpload size={16} />, action: gitPush };
    if (behindCount > 0) return { label: `Pull (${behindCount})`, icon: <ArrowDown size={16} />, action: gitPull };
    if (aheadCount > 0) return { label: `Push (${aheadCount})`, icon: <ArrowUp size={16} />, action: gitPush };
    return { label: "Fetch", icon: <RefreshCw size={16} />, action: gitFetch };
  }, [hasRemote, aheadCount, behindCount, gitPull, gitPush, gitFetch]);

  const topBarConfig = useMemo(() => {
    if (!isActive) return null;
    return {
      show: true,
      leftButtons: [
        {
          icon: <GitBranch size={16} />,
          label: currentBranch || "branch",
          onClick: () => setShowBranchSelector(true),
          disabled: branches.length === 0,
        },
      ],
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
              {t.changes}
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
            <span className="font-medium">{t.history}</span>
          </div>
        </div>
      ),
      rightButtons: [
        ...(hasRemote || aheadCount > 0
          ? [{ icon: smartAction.icon, label: smartAction.label, onClick: smartAction.action, disabled: isLoading }]
          : []),
        {
          icon: <RefreshCw size={16} className={isLoading ? "animate-spin" : ""} />,
          onClick: handleRefresh,
          disabled: isLoading,
        },
      ],
    };
  }, [isActive, branches, currentBranch, activeTab, allFiles.length, isLoading, hasRemote, aheadCount, behindCount, t, setActiveTab, handleRefresh, smartAction]);

  usePageTopBar(topBarConfig, [topBarConfig]);

  const handleFileClick = useCallback(
    async (filePath: string) => {
      const diff = await getDiff(filePath);
      if (diff) {
        const fileName = filePath.split("/").pop() || filePath;
        onFileDiff(diff.old, diff.new, `${fileName} [DIFF]`, fileName);
      }
    },
    [getDiff, onFileDiff]
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
        onFileDiff(diff.old, diff.new, `${fileName} @ ${shortHash}`, fileName);
      }
    },
    [getCommitDiff, onFileDiff]
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
        <div className="flex-1 overflow-hidden">
          {activeTab === "changes" ? (
            <GitChangesView
              allFiles={allFiles}
              checkedFiles={checkedFiles}
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
