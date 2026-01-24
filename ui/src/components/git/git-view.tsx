import { ArrowDown, ArrowUp, FileText, GitBranch, History, RefreshCw } from "lucide-react";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { GitCommit } from "@/api/git";
import { usePageTopBar } from "@/hooks/use-page-top-bar";
import { type Locale } from "@/lib/i18n";
import { type GitFileNode, useGitStore } from "@/stores";
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
  en: {
    changes: "Changes",
    history: "History",
    refresh: "Refresh",
  },
  zh: {
    changes: "更改",
    history: "历史",
    refresh: "刷新",
  },
};

const GitView: React.FC<GitViewProps> = ({ path, locale, onFileDiff, onConflict, isActive = true }) => {
  const t = i18n[locale] || i18n.en;
  const [showBranchSelector, setShowBranchSelector] = useState(false);

  const {
    currentPath: currentRepoPath,
    stagedFiles,
    unstagedFiles,
    commits,
    commitMessage,
    isLoading,
    selectedCommitFiles,
    selectedCommit,
    currentBranch,
    branches,
    activeTab,
    hasRemote,
    stashes,
    conflicts,
    setCurrentPath,
    setCommitMessage,
    setActiveTab,
    reset,
    fetchStatus,
    fetchLog,
    fetchBranches,
    fetchRemotes,
    fetchStashes,
    fetchConflicts,
    switchBranch,
    stageFile,
    unstageFile,
    stageAll,
    unstageAll,
    discardFile,
    commit,
    getDiff,
    setSelectedCommit,
    setSelectedCommitFiles,
    getCommitFiles,
    getCommitDiff,
    gitPull,
    gitPush,
    stash,
    stashPop,
    stashDrop,
    createBranch,
    deleteBranch,
  } = useGitStore();

  const initializedRef = useRef(false);

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
      fetchStashes();
      fetchConflicts();
    }
  }, [path, currentRepoPath, setCurrentPath, reset, fetchStatus, fetchLog, fetchBranches, fetchRemotes, fetchStashes, fetchConflicts]);

  const handleRefresh = useCallback(() => {
    fetchStatus();
    if (activeTab === "history") {
      fetchLog();
    }
  }, [fetchStatus, fetchLog, activeTab]);

  const handleBranchClick = useCallback(() => {
    setShowBranchSelector(true);
  }, []);

  const topBarConfig = useMemo(() => {
    if (!isActive) return null;

    return {
      show: true,
      leftButtons: [
        {
          icon: <GitBranch size={18} />,
          onClick: handleBranchClick,
          disabled: branches.length === 0,
        },
      ],
      centerContent: (
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar touch-pan-x h-full">
          <div
            onClick={() => setActiveTab("changes")}
            className={`shrink-0 px-2 h-7 rounded-md flex items-center gap-1 text-xs border transition-all cursor-pointer ${
              activeTab === "changes"
                ? "bg-ide-panel border-ide-accent text-ide-accent border-b-2 shadow-sm"
                : "bg-transparent border-transparent text-ide-mute hover:bg-ide-panel hover:text-ide-text"
            }`}
          >
            <FileText size={12} />
            <span className="font-medium">
              {t.changes}
              {stagedFiles.length + unstagedFiles.length > 0 && ` (${stagedFiles.length + unstagedFiles.length})`}
            </span>
          </div>
          <div
            onClick={() => setActiveTab("history")}
            className={`shrink-0 px-2 h-7 rounded-md flex items-center gap-1 text-xs border transition-all cursor-pointer ${
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
        ...(hasRemote
          ? [
              {
                icon: <ArrowDown size={18} />,
                onClick: gitPull,
                disabled: isLoading,
                title: "Pull",
              },
              {
                icon: <ArrowUp size={18} />,
                onClick: gitPush,
                disabled: isLoading,
                title: "Push",
              },
            ]
          : []),
        {
          icon: <RefreshCw size={18} className={isLoading ? "animate-spin" : ""} />,
          onClick: handleRefresh,
          disabled: isLoading,
        },
      ],
    };
  }, [
    isActive,
    branches,
    currentBranch,
    activeTab,
    stagedFiles.length,
    unstagedFiles.length,
    isLoading,
    hasRemote,
    t,
    setActiveTab,
    handleRefresh,
    handleBranchClick,
    gitPull,
    gitPush,
  ]);

  usePageTopBar(topBarConfig, [topBarConfig]);

  const handleFileClick = useCallback(
    async (file: GitFileNode) => {
      const diff = await getDiff(file.path);
      if (diff) {
        onFileDiff(diff.old, diff.new, `${file.name} [DIFF]`, file.name);
      }
    },
    [getDiff, onFileDiff]
  );

  const handleCommitSelect = useCallback(
    async (commitInfo: GitCommit) => {
      setSelectedCommit(commitInfo);
      const files = await getCommitFiles(commitInfo.hash);
      const fileNodes = files.map((f) => ({
        id: `commit-${commitInfo.hash}-${f.path}`,
        name: f.path.split("/").pop() || f.path,
        status: f.status === "A" ? "added" : f.status === "D" ? "deleted" : "modified",
        path: f.path,
        staged: false,
      }));
      setSelectedCommitFiles(fileNodes as any);
    },
    [setSelectedCommit, setSelectedCommitFiles, getCommitFiles]
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

  const handleCommit = useCallback(async () => {
    await commit();
  }, [commit]);

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
              stagedFiles={stagedFiles}
              unstagedFiles={unstagedFiles}
              commitMessage={commitMessage}
              isLoading={isLoading}
              locale={locale}
              stashes={stashes}
              conflicts={conflicts}
              onFileClick={handleFileClick}
              onStageFile={stageFile}
              onUnstageFile={unstageFile}
              onDiscardFile={discardFile}
              onStageAll={stageAll}
              onUnstageAll={unstageAll}
              onCommitMessageChange={setCommitMessage}
              onCommit={handleCommit}
              onStash={stash}
              onStashPop={stashPop}
              onStashDrop={stashDrop}
              onConflictClick={handleConflictClick}
            />
          ) : (
            <GitHistoryView
              commits={commits}
              isLoading={isLoading}
              locale={locale}
              onCommitSelect={handleCommitSelect}
              onFileClick={handleHistoryFileClick}
              selectedCommitFiles={selectedCommitFiles.map((f) => ({
                path: f.path,
                status: f.status,
              }))}
              selectedCommitHash={selectedCommit?.hash || null}
            />
          )}
        </div>
      </div>
      <BranchSelector
        isOpen={showBranchSelector}
        branches={branches}
        currentBranch={currentBranch}
        locale={locale}
        onClose={() => setShowBranchSelector(false)}
        onSwitch={switchBranch}
        onCreate={createBranch}
        onDelete={deleteBranch}
      />
    </>
  );
};

export default GitView;
