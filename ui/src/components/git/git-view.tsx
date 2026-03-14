import {
  ArrowDown,
  ArrowUp,
  CloudUpload,
  FileText,
  FolderGit2,
  GitBranch,
  GitGraph,
  History,
  Loader2,
  RefreshCw,
} from "lucide-react";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { GitCommit } from "@/api/git";
import { gitApi } from "@/api/git";
import { useDialog } from "@/components/common";
import { usePageTopBar } from "@/hooks/use-page-top-bar";
import { getTranslation, type Locale } from "@/lib/i18n";
import { useSessionStore } from "@/stores/session-store";
import { type GitSyncOptions, useGitStore } from "@/stores";
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
  groupId: string;
  path: string;
  locale: Locale;
  onFileDiff: (payload: GitDiffRequest) => void;
  onConflict?: (repoPath: string, filePath: string) => void;
  isActive?: boolean;
}

type GitAutoSyncOptions = Omit<GitSyncOptions, "silent">;

const hasAutoSyncWork = (options: GitAutoSyncOptions) =>
  !!(
    options.status ||
    options.history ||
    options.branches ||
    options.remotes ||
    options.branchStatus ||
    options.stashes ||
    options.conflicts ||
    options.draft
  );

const GitView: React.FC<GitViewProps> = ({ groupId, path, locale, onFileDiff, onConflict, isActive = true }) => {
  const t = (key: string) => getTranslation(locale, key);
  const dialog = useDialog();
  const [showBranchSelector, setShowBranchSelector] = useState(false);
  const currentSessionId = useSessionStore((s) => s.currentSessionId);
  const {
    currentPath: currentRepoPath,
    isRepo,
    allFiles,
    commits,
    isLoading,
    selectedCommit,
    selectedCommitFiles,
    currentBranch,
    branches,
    remoteBranches,
    activeTab,
    hasRemote,
    remoteUrls,
    aheadCount,
    behindCount,
    stashes,
    conflicts,
    error,
    setCurrentPath,
    setScope,
    setActiveTab,
    reset,
    checkRepo,
    initRepo,
    fetchMoreLog,
    syncRepo,
    smartSwitchBranch,
    gitPull,
    gitPush,
    gitFetch,
    stash,
    stashPop,
    stashDrop,
    createBranch,
    deleteBranch,
    setSelectedCommit,
    getCommitFiles,
    getCommitDiff,
    toggleFile,
    toggleAllFiles,
    discardFile,
    undoLastCommit,
    applyStatusUpdate,
    applyBranchStatus,
  } = useGitStore(groupId);

  const wsCleanupRef = useRef<(() => void) | null>(null);
  const autoSyncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingAutoSyncRef = useRef<GitAutoSyncOptions>({});

  const flushAutoSync = useCallback(() => {
    if (!isActive || isRepo !== true || isLoading) {
      return;
    }
    const pending = pendingAutoSyncRef.current;
    if (!hasAutoSyncWork(pending)) {
      return;
    }
    pendingAutoSyncRef.current = {};
    void syncRepo({
      ...pending,
      silent: true,
    });
  }, [isActive, isLoading, isRepo, syncRepo]);

  const scheduleAutoSync = useCallback(
    (options: GitAutoSyncOptions) => {
      if (!isActive || isRepo !== true) {
        return;
      }
      pendingAutoSyncRef.current = {
        status: pendingAutoSyncRef.current.status || options.status,
        history: pendingAutoSyncRef.current.history || options.history,
        branches: pendingAutoSyncRef.current.branches || options.branches,
        remotes: pendingAutoSyncRef.current.remotes || options.remotes,
        branchStatus: pendingAutoSyncRef.current.branchStatus || options.branchStatus,
        stashes: pendingAutoSyncRef.current.stashes || options.stashes,
        conflicts: pendingAutoSyncRef.current.conflicts || options.conflicts,
        draft: pendingAutoSyncRef.current.draft || options.draft,
      };
      if (autoSyncTimerRef.current) {
        return;
      }
      autoSyncTimerRef.current = setTimeout(() => {
        autoSyncTimerRef.current = null;
        flushAutoSync();
      }, 120);
    },
    [flushAutoSync, isActive, isRepo]
  );

  const fetchAllGitData = useCallback(() => {
    void syncRepo();
  }, [syncRepo]);

  useEffect(() => {
    if (currentRepoPath !== path) {
      reset();
      setCurrentPath(path);
      return;
    }

    if (isRepo !== null) {
      return;
    }

    let cancelled = false;

    void checkRepo().then((ok) => {
      if (!ok || cancelled) {
        return;
      }
      fetchAllGitData();
    });

    return () => {
      cancelled = true;
    };
  }, [path, currentRepoPath, isRepo, setCurrentPath, reset, checkRepo, fetchAllGitData]);

  useEffect(() => {
    if (!isLoading && !autoSyncTimerRef.current && hasAutoSyncWork(pendingAutoSyncRef.current)) {
      autoSyncTimerRef.current = setTimeout(() => {
        autoSyncTimerRef.current = null;
        flushAutoSync();
      }, 0);
    }
  }, [flushAutoSync, isLoading]);

  useEffect(() => {
    return () => {
      if (autoSyncTimerRef.current) {
        clearTimeout(autoSyncTimerRef.current);
        autoSyncTimerRef.current = null;
      }
      pendingAutoSyncRef.current = {};
    };
  }, []);

  useEffect(() => {
    setScope(currentSessionId);
  }, [currentSessionId, setScope]);

  useEffect(() => {
    if (!path || !isActive || isRepo !== true) return;
    wsCleanupRef.current = gitApi.connectWs(
      path,
      (event) => {
      if (event.type === "file_changed" && event.data.files) {
        applyStatusUpdate(event.data.files as any);
      }
      if (event.type === "remote_updated") {
        applyBranchStatus(event.data as any);
      }
      if (event.type === "repo_sync_needed") {
        scheduleAutoSync({
          status: event.data.status === true,
          history: event.data.history === true,
          branches: event.data.branches === true,
          remotes: event.data.remotes === true,
          stashes: event.data.stashes === true,
          conflicts: event.data.conflicts === true,
          draft: event.data.draft === true,
        });
      }
      },
      { workspace_session_id: currentSessionId || undefined, group_id: groupId }
    );
    return () => {
      wsCleanupRef.current?.();
      wsCleanupRef.current = null;
    };
  }, [path, isActive, isRepo, currentSessionId, groupId, applyStatusUpdate, applyBranchStatus, scheduleAutoSync]);

  useEffect(() => {
    if (!isActive || isRepo !== true) {
      return;
    }
    const handleFocus = () => {
      scheduleAutoSync({
        status: true,
        history: true,
        branches: true,
        remotes: true,
        branchStatus: true,
        stashes: true,
        conflicts: true,
        draft: true,
      });
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        handleFocus();
      }
    };
    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [isActive, isRepo, scheduleAutoSync]);

  useEffect(() => {
    if (activeTab === "history" && isActive && isRepo === true) {
      scheduleAutoSync({ history: true });
    }
  }, [activeTab, isActive, isRepo, scheduleAutoSync]);

  const handleRefresh = useCallback(() => {
    void syncRepo();
  }, [syncRepo]);

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
    if (isRepo !== true) {
      return {
        show: true,
        leftButtons: [{ icon: <GitGraph size={18} />, active: true }],
        centerContent: null,
        rightButtons: [],
      };
    }
    return {
      show: true,
      leftButtons: [{ icon: <GitGraph size={18} />, active: true }],
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
  }, [isActive, isRepo, activeTab, allFiles.length, isLoading, t, setActiveTab, handleRefresh]);

  usePageTopBar(topBarConfig, [topBarConfig]);

  const handleInitRepo = useCallback(async () => {
    const confirmed = await dialog.confirm(t("git.initRepoConfirmTitle"), t("git.initRepoConfirmMessage"), {
      confirmText: t("git.initRepo"),
    });
    if (!confirmed) return;
    const ok = await initRepo();
    if (ok) {
      fetchAllGitData();
    }
  }, [dialog, t, initRepo, fetchAllGitData]);

  const handleFileClick = useCallback(
    async (filePath: string) => {
      const file = allFiles.find((item) => item.path === filePath);
      const fileName = filePath.split("/").pop() || filePath;
      onFileDiff({
        original: "",
        modified: "",
        title: `${fileName} [DIFF]`,
        filename: fileName,
        filePath,
        repoPath: path,
        allowSelection: file ? ["modified", "added", "untracked"].includes(file.status) : false,
      });
    },
    [allFiles, onFileDiff, path]
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

  const handleHistoryUndoCommit = useCallback(
    async (commitInfo: GitCommit) => {
      if (isLoading || commits[0]?.hash !== commitInfo.hash || commitInfo.parentCount === 0) {
        return;
      }

      if (allFiles.length > 0 || conflicts.length > 0) {
        const confirmed = await dialog.confirm(t("git.undoCommitConfirmTitle"), t("git.undoCommitConfirmMessage"), {
          confirmText: t("git.undoCommit"),
          confirmVariant: "danger",
        });

        if (!confirmed) {
          return;
        }
      }

      const ok = await undoLastCommit();
      if (!ok) {
        await dialog.alert(t("git.undoCommitFailed"), error || undefined);
        return;
      }

      setActiveTab("changes");
    },
    [allFiles.length, commits, conflicts.length, dialog, error, isLoading, setActiveTab, t, undoLastCommit]
  );

  const handleConflictClick = useCallback(
    (conflictPath: string) => {
      onConflict?.(path, conflictPath);
    },
    [path, onConflict]
  );

  if (isRepo === null) {
    return (
      <div className="flex flex-col items-center justify-center h-full bg-ide-bg">
        <Loader2 size={24} className="text-ide-mute animate-spin" />
      </div>
    );
  }

  if (isRepo === false) {
    return (
      <div className="flex flex-col items-center justify-center h-full bg-ide-bg gap-4">
        <FolderGit2 size={48} className="text-ide-mute/40" />
        <div className="flex flex-col items-center gap-1.5 text-center">
          <span className="text-ide-text text-sm font-medium">{t("git.notARepo")}</span>
          <span className="text-ide-mute text-xs max-w-[240px]">{t("git.notARepoHint")}</span>
        </div>
        <button
          onClick={handleInitRepo}
          disabled={isLoading}
          className="flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium bg-ide-accent text-ide-bg hover:bg-ide-accent/80 transition-colors disabled:opacity-50"
        >
          <GitGraph size={16} />
          {t("git.initRepo")}
        </button>
      </div>
    );
  }

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
          {(hasRemote || aheadCount > 0) && (allFiles.length > 0 || conflicts.length > 0) && (
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
              groupId={groupId}
              allFiles={allFiles}
              isLoading={isLoading}
              locale={locale}
              currentBranch={currentBranch}
              stashes={stashes}
              conflicts={conflicts}
              hasRemote={hasRemote}
              aheadCount={aheadCount}
              behindCount={behindCount}
              onFileClick={handleFileClick}
              onToggleFile={toggleFile}
              onToggleAll={toggleAllFiles}
              onDiscardFile={discardFile}
              onConflictClick={handleConflictClick}
              onStash={stash}
              onStashPop={stashPop}
              onStashDrop={stashDrop}
              onPull={gitPull}
              onPush={gitPush}
              onFetch={gitFetch}
              onUndoLastCommit={undoLastCommit}
            />
          ) : (
            <GitHistoryView
              commits={commits}
              isLoading={isLoading}
              locale={locale}
              remoteUrls={remoteUrls}
              onCommitSelect={handleCommitSelect}
              onUndoCommit={handleHistoryUndoCommit}
              onFileClick={handleHistoryFileClick}
              selectedCommitFiles={selectedCommitFiles}
              selectedCommitHash={selectedCommit?.hash || null}
              onLoadMore={fetchMoreLog}
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
