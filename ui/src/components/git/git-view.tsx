import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  ChevronLeft,
  ChevronsUpDown,
  CloudUpload,
  FileText,
  GitGraph,
  History,
  RefreshCw,
  Save,
  Search,
} from "lucide-react";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  CommitFileInfo,
  GitCommit,
  GitConflictDetailsV2,
  GitDiff,
  GitInteractiveDiff,
  GitInteractiveDiffV2,
  GitStashFile,
  GitStructuredFile,
  GitStructuredStatus,
  StashEntry,
} from "@/api/git";
import { gitApi } from "@/api/git";
import { useDialog } from "@/components/common";
import { useIsMobile } from "@/hooks/use-mobile";
import { usePageTopBar } from "@/hooks/use-page-top-bar";
import { getTranslation, type Locale } from "@/lib/i18n";
import BranchSelector from "./branch-selector";
import DesktopDiffView from "./desktop-diff-view";

interface GitViewProps {
  path: string;
  locale: Locale;
  isActive?: boolean;
}

type MainTab = "changes" | "history" | "stashes" | "conflicts";

const EMPTY_STATUS: GitStructuredStatus = {
  files: [],
  summary: { changed: 0, staged: 0, unstaged: 0, included: 0, conflicted: 0 },
};

const statusToShort = (status: string) => {
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
      return "?";
    case "unmerged":
      return "U";
    default:
      return "·";
  }
};

const statusColor = (status: string) => {
  switch (status) {
    case "modified":
      return "text-yellow-400";
    case "added":
    case "untracked":
      return "text-green-400";
    case "deleted":
      return "text-red-400";
    case "renamed":
    case "copied":
      return "text-blue-400";
    case "unmerged":
      return "text-red-500";
    default:
      return "text-ide-mute";
  }
};

const asErrorMessage = (err: unknown) => {
  if (err instanceof Error) return err.message;
  return "Operation failed";
};

const firstLine = (text: string) => text.split("\n")[0] || text;

const getFileDiffMode = (file: GitStructuredFile): "working" | "staged" => {
  if (file.worktreeStatus === "untracked") return "working";
  if (file.worktreeStatus !== "clean") return "working";
  if (file.indexStatus !== "clean") return "staged";
  return "working";
};

const relativeDate = (dateStr: string) => {
  const date = new Date(dateStr);
  const delta = Date.now() - date.getTime();
  const minutes = Math.floor(delta / 60000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  if (Number.isNaN(delta)) return dateStr;
  if (days > 30) return date.toLocaleDateString();
  if (days > 0) return `${days}d`;
  if (hours > 0) return `${hours}h`;
  if (minutes > 0) return `${minutes}m`;
  return "now";
};

const buildConflictContent = (details: GitConflictDetailsV2, source: "ours" | "base" | "theirs") => {
  const parts: string[] = [];
  details.segments.forEach((seg) => {
    if (seg.type === "plain") {
      parts.push(seg.text || "");
      return;
    }
    if (source === "ours") parts.push((seg.ours || []).join("\n"));
    if (source === "base") parts.push((seg.base || []).join("\n"));
    if (source === "theirs") parts.push((seg.theirs || []).join("\n"));
  });
  return parts.join("\n");
};

const GitView: React.FC<GitViewProps> = ({ path, locale, isActive = true }) => {
  const t = (key: string) => getTranslation(locale, key);
  const dialog = useDialog();
  const isMobile = useIsMobile();

  const [activeTab, setActiveTab] = useState<MainTab>("changes");
  const [loading, setLoading] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");

  const [status, setStatus] = useState<GitStructuredStatus>(EMPTY_STATUS);
  const [checkedFiles, setCheckedFiles] = useState<Set<string>>(new Set());
  const [fileFilter, setFileFilter] = useState("");

  const [summary, setSummary] = useState("");
  const [description, setDescription] = useState("");
  const [amend, setAmend] = useState(false);

  const [fileDiff, setFileDiff] = useState<GitInteractiveDiffV2 | null>(null);
  const [selectedFile, setSelectedFile] = useState("");
  const [selectedHunks, setSelectedHunks] = useState<Set<string>>(new Set());
  const [selectedLines, setSelectedLines] = useState<Set<string>>(new Set());

  const [commits, setCommits] = useState<GitCommit[]>([]);
  const [selectedCommit, setSelectedCommit] = useState<GitCommit | null>(null);
  const [selectedCommitFiles, setSelectedCommitFiles] = useState<CommitFileInfo[]>([]);
  const [historyDiff, setHistoryDiff] = useState<GitDiff | null>(null);
  const [selectedHistoryFile, setSelectedHistoryFile] = useState("");

  const [stashes, setStashes] = useState<StashEntry[]>([]);
  const [selectedStash, setSelectedStash] = useState<StashEntry | null>(null);
  const [stashFiles, setStashFiles] = useState<GitStashFile[]>([]);
  const [stashDiff, setStashDiff] = useState<GitInteractiveDiff | null>(null);
  const [selectedStashFile, setSelectedStashFile] = useState("");

  const [conflicts, setConflicts] = useState<string[]>([]);
  const [selectedConflict, setSelectedConflict] = useState("");
  const [conflictDetails, setConflictDetails] = useState<GitConflictDetailsV2 | null>(null);
  const [conflictHash, setConflictHash] = useState("");
  const [manualContent, setManualContent] = useState("");
  const [conflictTab, setConflictTab] = useState<"ours" | "base" | "theirs" | "manual">("ours");

  const [currentBranch, setCurrentBranch] = useState("main");
  const [branches, setBranches] = useState<string[]>([]);
  const [remoteBranches, setRemoteBranches] = useState<string[]>([]);
  const [aheadCount, setAheadCount] = useState(0);
  const [behindCount, setBehindCount] = useState(0);
  const [hasRemote, setHasRemote] = useState(false);
  const [showBranchSelector, setShowBranchSelector] = useState(false);

  const selectionInitializedRef = useRef(false);

  const updateStatus = useCallback((next: GitStructuredStatus, forceSelectAll = false) => {
    setStatus(next);
    setCheckedFiles((prev) => {
      const valid = new Set(next.files.map((f) => f.path));
      if (forceSelectAll || !selectionInitializedRef.current) {
        selectionInitializedRef.current = true;
        return new Set(next.files.map((f) => f.path));
      }
      const kept = new Set<string>();
      prev.forEach((p) => {
        if (valid.has(p)) kept.add(p);
      });
      return kept;
    });
  }, []);

  const clearDetailStates = useCallback(() => {
    setFileDiff(null);
    setSelectedFile("");
    setSelectedHunks(new Set());
    setSelectedLines(new Set());
    setSelectedCommit(null);
    setSelectedCommitFiles([]);
    setHistoryDiff(null);
    setSelectedHistoryFile("");
    setSelectedStash(null);
    setStashFiles([]);
    setStashDiff(null);
    setSelectedStashFile("");
    setSelectedConflict("");
    setConflictDetails(null);
    setConflictHash("");
    setManualContent("");
    setConflictTab("ours");
  }, []);

  const refreshStatusAndConflicts = useCallback(async () => {
    if (!path) return;
    const [statusRes, conflictsRes] = await Promise.all([
      gitApi.statusV2(path),
      gitApi.conflicts(path).catch(() => ({ conflicts: [] })),
    ]);
    updateStatus(statusRes);
    setConflicts(conflictsRes.conflicts || []);
  }, [path, updateStatus]);

  const loadAll = useCallback(
    async (forceSelectAll = false) => {
      if (!path) return;
      setLoading(true);
      setError("");
      const [statusRes, logRes, branchRes, remoteRes, branchStatusRes, stashRes, conflictRes] = await Promise.allSettled([
        gitApi.statusV2(path),
        gitApi.log(path, 100),
        gitApi.branches(path),
        gitApi.remotes(path),
        gitApi.branchStatus(path),
        gitApi.stashList(path),
        gitApi.conflicts(path),
      ]);

      if (statusRes.status === "fulfilled") {
        updateStatus(statusRes.value, forceSelectAll);
      }
      if (logRes.status === "fulfilled") {
        setCommits(logRes.value.commits || []);
      }
      if (branchRes.status === "fulfilled") {
        setBranches((branchRes.value.branches || []).map((b) => b.name));
        setRemoteBranches(branchRes.value.remoteBranches || []);
        if (branchRes.value.currentBranch) setCurrentBranch(branchRes.value.currentBranch);
      }
      if (remoteRes.status === "fulfilled") {
        setHasRemote((remoteRes.value.remotes || []).length > 0);
      }
      if (branchStatusRes.status === "fulfilled") {
        setAheadCount(branchStatusRes.value.ahead || 0);
        setBehindCount(branchStatusRes.value.behind || 0);
        if (branchStatusRes.value.branch) setCurrentBranch(branchStatusRes.value.branch);
      }
      if (stashRes.status === "fulfilled") {
        setStashes(stashRes.value.stashes || []);
      }
      if (conflictRes.status === "fulfilled") {
        setConflicts(conflictRes.value.conflicts || []);
      }

      const rejected = [statusRes, logRes, branchRes, remoteRes, branchStatusRes, stashRes, conflictRes].find(
        (r) => r.status === "rejected"
      );
      if (rejected && rejected.status === "rejected") {
        setError(asErrorMessage(rejected.reason));
      }
      setLoading(false);
    },
    [path, updateStatus]
  );

  useEffect(() => {
    if (!path) return;
    selectionInitializedRef.current = false;
    clearDetailStates();
    setFileFilter("");
    setSummary("");
    setDescription("");
    setAmend(false);
    void loadAll(true);
  }, [path, clearDetailStates, loadAll]);

  const runAction = useCallback(
    async (fn: () => Promise<void>) => {
      setRunning(true);
      setError("");
      try {
        await fn();
      } catch (err) {
        setError(asErrorMessage(err));
      } finally {
        setRunning(false);
      }
    },
    []
  );

  const openFileDiff = useCallback(
    async (file: GitStructuredFile) => {
      if (!path) return;
      await runAction(async () => {
        let mode = getFileDiffMode(file);
        let diff = await gitApi.fileDiffV2(path, file.path, mode);
        if (mode === "working" && diff.hunks.length === 0 && file.indexStatus !== "clean" && file.indexStatus !== "untracked") {
          mode = "staged";
          diff = await gitApi.fileDiffV2(path, file.path, mode);
        }
        setSelectedFile(file.path);
        setFileDiff(diff);
        setSelectedHunks(new Set(diff.hunks.map((h) => h.id)));
        if (diff.capability.lineSelectable) {
          const lines = new Set<string>();
          diff.hunks.forEach((h) => {
            h.lines.forEach((l) => {
              if (l.selectable) lines.add(l.id);
            });
          });
          setSelectedLines(lines);
        } else {
          setSelectedLines(new Set());
        }
      });
    },
    [path, runAction]
  );

  const filteredFiles = useMemo(() => {
    const keyword = fileFilter.trim().toLowerCase();
    if (!keyword) return status.files;
    return status.files.filter((f) => f.path.toLowerCase().includes(keyword) || f.name.toLowerCase().includes(keyword));
  }, [status.files, fileFilter]);

  const toggleAllChecked = useCallback(() => {
    setCheckedFiles((prev) => {
      if (status.files.length > 0 && status.files.every((f) => prev.has(f.path))) {
        return new Set();
      }
      return new Set(status.files.map((f) => f.path));
    });
  }, [status.files]);

  const handleStageToggle = useCallback(
    async (file: GitStructuredFile) => {
      if (!path) return;
      await runAction(async () => {
        if (file.indexStatus === "clean" || file.indexStatus === "untracked") {
          await gitApi.add(path, [file.path]);
        } else {
          await gitApi.reset(path, [file.path]);
        }
        await refreshStatusAndConflicts();
        if (selectedFile === file.path) {
          await openFileDiff(file);
        }
      });
    },
    [path, runAction, refreshStatusAndConflicts, selectedFile, openFileDiff]
  );

  const handleDiscardFile = useCallback(
    async (file: GitStructuredFile) => {
      if (!path) return;
      const ok = await dialog.confirm(
        `${t("git.discard")} ${file.path}`,
        t("git.discardWarning"),
        { confirmVariant: "danger", confirmText: t("git.confirm"), cancelText: t("git.cancel") }
      );
      if (!ok) return;
      await runAction(async () => {
        await gitApi.checkout(path, [file.path]);
        await refreshStatusAndConflicts();
        if (selectedFile === file.path) {
          setSelectedFile("");
          setFileDiff(null);
          setSelectedHunks(new Set());
          setSelectedLines(new Set());
        }
      });
    },
    [path, dialog, t, runAction, refreshStatusAndConflicts, selectedFile]
  );

  const applyHunkAction = useCallback(
    async (action: "include" | "exclude" | "discard") => {
      if (!path || !fileDiff) return;
      const mode = fileDiff.mode;
      if (selectedHunks.size === 0 && selectedLines.size === 0) return;
      if (action === "discard") {
        const ok = await dialog.confirm(t("git.discard"), t("git.discardWarning"), {
          confirmVariant: "danger",
          confirmText: t("git.confirm"),
          cancelText: t("git.cancel"),
        });
        if (!ok) return;
      }
      await runAction(async () => {
        const target = selectedLines.size > 0 ? "line" : selectedHunks.size > 0 ? "hunk" : "file";
        const res = await gitApi.applySelectionV2(
          path,
          fileDiff.path,
          mode,
          target,
          action,
          fileDiff.patchHash,
          Array.from(selectedLines),
          Array.from(selectedHunks)
        );
        updateStatus(res.status);
        if (res.diff) {
          setFileDiff(res.diff);
          setSelectedHunks(new Set(res.diff.hunks.map((h) => h.id)));
          if (res.diff.capability.lineSelectable) {
            const lines = new Set<string>();
            res.diff.hunks.forEach((h) => {
              h.lines.forEach((l) => {
                if (l.selectable) lines.add(l.id);
              });
            });
            setSelectedLines(lines);
          } else {
            setSelectedLines(new Set());
          }
        } else {
          setFileDiff(null);
          setSelectedHunks(new Set());
          setSelectedLines(new Set());
        }
        const conflictsRes = await gitApi.conflicts(path).catch(() => ({ conflicts: [] }));
        setConflicts(conflictsRes.conflicts || []);
      });
    },
    [path, fileDiff, selectedHunks, selectedLines, dialog, t, runAction, updateStatus]
  );

  const selectAllDiffSelection = useCallback(() => {
    if (!fileDiff) return;
    setSelectedHunks(new Set(fileDiff.hunks.map((h) => h.id)));
    if (fileDiff.capability.lineSelectable) {
      const next = new Set<string>();
      fileDiff.hunks.forEach((h) => {
        h.lines.forEach((l) => {
          if (l.selectable) next.add(l.id);
        });
      });
      setSelectedLines(next);
    } else {
      setSelectedLines(new Set());
    }
  }, [fileDiff]);

  const clearDiffSelection = useCallback(() => {
    setSelectedLines(new Set());
    setSelectedHunks(new Set());
  }, []);

  const commitDisabled = !summary.trim() || checkedFiles.size === 0 || conflicts.length > 0 || running;

  const handleCommit = useCallback(async () => {
    if (!path || commitDisabled) return;
    await runAction(async () => {
      const files = Array.from(checkedFiles);
      if (amend) {
        await gitApi.amend(path, files, summary.trim(), description.trim() || undefined);
      } else {
        await gitApi.commitSelected(path, files, summary.trim(), description.trim() || undefined);
      }
      setSummary("");
      setDescription("");
      setAmend(false);
      await loadAll(false);
      await refreshStatusAndConflicts();
      setSelectedFile("");
      setFileDiff(null);
      setSelectedHunks(new Set());
      setSelectedLines(new Set());
    });
  }, [path, commitDisabled, runAction, checkedFiles, amend, summary, description, loadAll, refreshStatusAndConflicts]);

  const handleSelectCommit = useCallback(
    async (commit: GitCommit) => {
      if (!path) return;
      await runAction(async () => {
        const res = await gitApi.commitFiles(path, commit.hash);
        setSelectedCommit(commit);
        setSelectedCommitFiles(res.files || []);
        setSelectedHistoryFile("");
        setHistoryDiff(null);
      });
    },
    [path, runAction]
  );

  const handleSelectHistoryFile = useCallback(
    async (filePath: string) => {
      if (!path || !selectedCommit) return;
      await runAction(async () => {
        const diff = await gitApi.commitDiff(path, selectedCommit.hash, filePath);
        setSelectedHistoryFile(filePath);
        setHistoryDiff(diff);
      });
    },
    [path, selectedCommit, runAction]
  );

  const handleOpenStash = useCallback(
    async (stash: StashEntry) => {
      if (!path) return;
      await runAction(async () => {
        const res = await gitApi.stashFiles(path, stash.index);
        setSelectedStash(stash);
        setStashFiles(res.files || []);
        setStashDiff(null);
        setSelectedStashFile("");
      });
    },
    [path, runAction]
  );

  const handleOpenStashFile = useCallback(
    async (filePath: string) => {
      if (!path || !selectedStash) return;
      await runAction(async () => {
        const diff = await gitApi.stashDiff(path, selectedStash.index, filePath);
        setSelectedStashFile(filePath);
        setStashDiff(diff);
      });
    },
    [path, selectedStash, runAction]
  );

  const handleStashPop = useCallback(
    async (index: number) => {
      if (!path) return;
      await runAction(async () => {
        await gitApi.stashPop(path, index);
        await loadAll(false);
        await refreshStatusAndConflicts();
        setSelectedStash(null);
        setStashFiles([]);
        setStashDiff(null);
        setSelectedStashFile("");
      });
    },
    [path, runAction, loadAll, refreshStatusAndConflicts]
  );

  const handleStashDrop = useCallback(
    async (index: number) => {
      if (!path) return;
      const ok = await dialog.confirm(t("git.drop"), `stash@{${index}}`, {
        confirmVariant: "danger",
        confirmText: t("git.drop"),
        cancelText: t("git.cancel"),
      });
      if (!ok) return;
      await runAction(async () => {
        await gitApi.stashDrop(path, index);
        await loadAll(false);
        if (selectedStash?.index === index) {
          setSelectedStash(null);
          setStashFiles([]);
          setStashDiff(null);
          setSelectedStashFile("");
        }
      });
    },
    [path, dialog, t, runAction, loadAll, selectedStash]
  );

  const handleOpenConflict = useCallback(
    async (filePath: string) => {
      if (!path) return;
      await runAction(async () => {
        const details = await gitApi.conflictDetailsV2(path, filePath);
        setSelectedConflict(filePath);
        setConflictDetails(details);
        setConflictHash(details.hash);
        setManualContent(buildConflictContent(details, "ours"));
        setConflictTab("ours");
      });
    },
    [path, runAction]
  );

  const handleResolveConflict = useCallback(
    async (mode: "ours" | "theirs" | "manual") => {
      if (!path || !selectedConflict || !conflictHash) return;
      await runAction(async () => {
        const res = await gitApi.conflictResolveV2(
          path,
          selectedConflict,
          mode === "manual" ? "line-map" : mode,
          conflictHash,
          mode === "manual" ? manualContent : undefined,
          mode === "manual" ? manualContent : undefined
        );
        setConflicts(res.conflicts || []);
        await refreshStatusAndConflicts();
        if ((res.conflicts || []).includes(selectedConflict)) {
          const details = await gitApi.conflictDetailsV2(path, selectedConflict);
          setConflictDetails(details);
          setConflictHash(details.hash);
          setManualContent(buildConflictContent(details, "ours"));
        } else {
          setSelectedConflict("");
          setConflictDetails(null);
          setConflictHash("");
          setManualContent("");
        }
      });
    },
    [path, selectedConflict, conflictHash, manualContent, runAction, refreshStatusAndConflicts]
  );

  const switchBranch = useCallback(
    async (branch: string) => {
      if (!path) return;
      await runAction(async () => {
        await gitApi.smartSwitchBranch(path, branch);
        await loadAll(true);
      });
    },
    [path, runAction, loadAll]
  );

  const createBranch = useCallback(
    async (branch: string) => {
      if (!path) return;
      await runAction(async () => {
        await gitApi.createBranch(path, branch);
        await loadAll(false);
      });
    },
    [path, runAction, loadAll]
  );

  const deleteBranch = useCallback(
    async (branch: string) => {
      if (!path) return;
      await runAction(async () => {
        await gitApi.deleteBranch(path, branch);
        await loadAll(false);
      });
    },
    [path, runAction, loadAll]
  );

  const smartAction = useMemo(() => {
    if (!hasRemote) {
      return {
        label: t("git.publish"),
        icon: <CloudUpload size={14} />,
        fn: async () => {
          if (!path) return;
          await gitApi.push(path);
        },
      };
    }
    if (behindCount > 0) {
      return {
        label: `${t("git.pull")} (${behindCount})`,
        icon: <ArrowDown size={14} />,
        fn: async () => {
          if (!path) return;
          await gitApi.pull(path);
        },
      };
    }
    if (aheadCount > 0) {
      return {
        label: `${t("git.push")} (${aheadCount})`,
        icon: <ArrowUp size={14} />,
        fn: async () => {
          if (!path) return;
          await gitApi.push(path);
        },
      };
    }
    return {
      label: t("git.fetch"),
      icon: <RefreshCw size={14} />,
      fn: async () => {
        if (!path) return;
        await gitApi.fetch(path);
      },
    };
  }, [hasRemote, behindCount, aheadCount, t, path]);

  const handleSmartAction = useCallback(async () => {
    await runAction(async () => {
      await smartAction.fn();
      await loadAll(false);
      await refreshStatusAndConflicts();
    });
  }, [runAction, smartAction, loadAll, refreshStatusAndConflicts]);

  const topBarConfig = useMemo(() => {
    if (!isActive) return null;
    const tabBtn = (tab: MainTab, label: string, icon: React.ReactNode, badge?: number) => (
      <button
        key={tab}
        onClick={() => setActiveTab(tab)}
        className={`h-7 px-2.5 rounded-md text-xs border transition-colors flex items-center gap-1 ${
          activeTab === tab
            ? "bg-ide-panel border-ide-accent text-ide-accent"
            : "bg-transparent border-transparent text-ide-mute hover:bg-ide-panel hover:text-ide-text"
        }`}
      >
        {icon}
        <span>{label}</span>
        {typeof badge === "number" && badge > 0 && <span className="text-[10px]">{badge}</span>}
      </button>
    );

    return {
      show: true,
      leftButtons: [{ icon: <GitGraph size={18} /> }],
      centerContent: (
        <div className="flex items-center gap-1 h-full">
          {tabBtn("changes", t("git.changes"), <FileText size={12} />, status.summary.changed)}
          {tabBtn("history", t("git.history"), <History size={12} />)}
          {tabBtn("stashes", t("git.stashes"), <Save size={12} />, stashes.length)}
          {tabBtn("conflicts", t("git.resolve"), <AlertTriangle size={12} />, conflicts.length)}
        </div>
      ),
      rightButtons: [
        {
          icon: <RefreshCw size={16} className={loading || running ? "animate-spin" : ""} />,
          onClick: () => {
            void loadAll(false);
          },
          disabled: loading || running,
        },
      ],
    };
  }, [isActive, activeTab, t, status.summary.changed, stashes.length, conflicts.length, loading, running, loadAll]);

  usePageTopBar(topBarConfig, [topBarConfig]);

  const changesListPane = (
    <div className="h-full flex flex-col bg-ide-bg">
      <div className="shrink-0 p-2 border-b border-ide-border bg-ide-panel/40">
        <div className="flex items-center gap-2 bg-ide-panel border border-ide-border rounded px-2 h-8">
          <Search size={14} className="text-ide-mute" />
          <input
            value={fileFilter}
            onChange={(e) => setFileFilter(e.target.value)}
            placeholder={t("git.searchBranches")}
            className="flex-1 bg-transparent text-xs text-ide-text outline-none"
          />
        </div>
      </div>

      <div className="shrink-0 px-3 h-8 border-b border-ide-border flex items-center justify-between text-[11px] text-ide-mute">
        <button onClick={toggleAllChecked} className="hover:text-ide-text">
          {t("git.selectAll")} ({checkedFiles.size}/{status.files.length})
        </button>
        <div className="flex items-center gap-2">
          <span>{t("git.filesChanged")}: {status.summary.changed}</span>
          <span>{t("git.conflicts")}: {status.summary.conflicted}</span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {filteredFiles.length === 0 && (
          <div className="h-full flex items-center justify-center text-sm text-ide-mute">{t("git.noChanges")}</div>
        )}
        {filteredFiles.map((file) => {
          const isChecked = checkedFiles.has(file.path);
          const selected = selectedFile === file.path;
          const canDiscard = file.worktreeStatus !== "clean" && file.worktreeStatus !== "untracked";
          return (
            <div
              key={file.path}
              className={`px-3 py-2 border-b border-ide-border/40 hover:bg-ide-panel/40 cursor-pointer ${selected ? "bg-ide-panel/50" : ""}`}
              onClick={() => {
                void openFileDiff(file);
              }}
            >
              <div className="flex items-start gap-2">
                <input
                  type="checkbox"
                  checked={isChecked}
                  className="mt-0.5"
                  onChange={(e) => {
                    e.stopPropagation();
                    setCheckedFiles((prev) => {
                      const next = new Set(prev);
                      if (next.has(file.path)) next.delete(file.path);
                      else next.add(file.path);
                      return next;
                    });
                  }}
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-ide-text truncate">{file.name}</span>
                    <span className={`text-[10px] font-mono ${statusColor(file.changeType)}`}>
                      {statusToShort(file.indexStatus)}|{statusToShort(file.worktreeStatus)}
                    </span>
                    {file.conflicted && (
                      <span className="text-[10px] px-1 py-0.5 rounded bg-red-500/20 text-red-400">U</span>
                    )}
                  </div>
                  {file.path !== file.name && <div className="text-[10px] text-ide-mute truncate">{file.path}</div>}
                </div>
                <button
                  className="h-6 px-2 text-[10px] rounded border border-ide-border hover:bg-ide-panel text-ide-text"
                  onClick={(e) => {
                    e.stopPropagation();
                    void handleStageToggle(file);
                  }}
                >
                  {file.indexStatus === "clean" || file.indexStatus === "untracked" ? t("git.add") : t("git.reset")}
                </button>
                {canDiscard && (
                  <button
                    className="h-6 px-2 text-[10px] rounded border border-red-500/30 text-red-400 hover:bg-red-500/15"
                    onClick={(e) => {
                      e.stopPropagation();
                      void handleDiscardFile(file);
                    }}
                  >
                    {t("git.discard")}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="shrink-0 border-t border-ide-border bg-ide-panel/50 p-3 space-y-2">
        {conflicts.length > 0 && (
          <div className="text-xs text-red-400 flex items-center gap-1">
            <AlertTriangle size={12} />
            <span>{conflicts.length} {t("git.conflicts")}</span>
          </div>
        )}
        <input
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          placeholder={t("git.summaryPlaceholder")}
          className="w-full h-8 px-2 rounded bg-ide-bg border border-ide-border text-xs text-ide-text outline-none"
        />
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder={t("git.descriptionPlaceholder")}
          className="w-full h-16 p-2 rounded bg-ide-bg border border-ide-border text-xs text-ide-text outline-none resize-none"
        />
        <label className="flex items-center gap-2 text-xs text-ide-mute">
          <input type="checkbox" checked={amend} onChange={(e) => setAmend(e.target.checked)} />
          <span>{t("git.amend")}</span>
        </label>
        <button
          disabled={commitDisabled}
          onClick={() => {
            void handleCommit();
          }}
          className="w-full h-8 rounded bg-ide-accent text-ide-bg text-xs font-medium disabled:opacity-50"
        >
          {t("git.commit")}
        </button>
      </div>
    </div>
  );

  const changesDetailPane = (
    <div className="h-full flex flex-col bg-ide-bg">
      {!fileDiff && <div className="h-full flex items-center justify-center text-sm text-ide-mute">{t("git.loading")}</div>}
      {fileDiff && (
        <>
          <div className="shrink-0 border-b border-ide-border bg-ide-panel/35">
            <div className={`${isMobile ? "h-9 px-2" : "h-10 px-3"} flex items-center justify-between gap-2`}>
              <div className="min-w-0">
                {!isMobile && <div className="text-xs text-ide-text truncate">{fileDiff.path}</div>}
                <div className="text-[10px] text-ide-mute uppercase truncate">
                  {isMobile
                    ? `${selectedLines.size} lines · ${selectedHunks.size} hunks`
                    : `${fileDiff.mode} · ${selectedLines.size} lines · ${selectedHunks.size} hunks`}
                </div>
              </div>
              {!isMobile && (
                <div className="flex items-center gap-1.5">
                  <button
                    className="h-7 px-2 text-[10px] rounded border border-ide-border hover:bg-ide-panel"
                    onClick={selectAllDiffSelection}
                  >
                    {t("git.selectAll")}
                  </button>
                  <button
                    className="h-7 px-2 text-[10px] rounded border border-ide-border hover:bg-ide-panel"
                    onClick={clearDiffSelection}
                  >
                    Clear
                  </button>
                  <button
                    className="h-7 px-2 text-[10px] rounded border border-ide-diff-add text-ide-diff-add hover:bg-ide-diff-add-bg"
                    onClick={() => {
                      void applyHunkAction("include");
                    }}
                  >
                    {t("git.add")}
                  </button>
                  <button
                    className="h-7 px-2 text-[10px] rounded border border-ide-border hover:bg-ide-panel"
                    onClick={() => {
                      void applyHunkAction("exclude");
                    }}
                  >
                    {t("git.reset")}
                  </button>
                  <button
                    className="h-7 px-2 text-[10px] rounded border border-ide-diff-del text-ide-diff-del hover:bg-ide-diff-del-bg"
                    onClick={() => {
                      void applyHunkAction("discard");
                    }}
                  >
                    {t("git.discard")}
                  </button>
                </div>
              )}
            </div>
            {isMobile && (
              <div className="h-9 px-2 border-t border-ide-border/40 flex items-center gap-1 overflow-x-auto">
                <button
                  className="h-7 px-2 shrink-0 text-[10px] rounded border border-ide-border hover:bg-ide-panel"
                  onClick={selectAllDiffSelection}
                >
                  {t("git.selectAll")}
                </button>
                <button
                  className="h-7 px-2 shrink-0 text-[10px] rounded border border-ide-border hover:bg-ide-panel"
                  onClick={clearDiffSelection}
                >
                  Clear
                </button>
                <button
                  className="h-7 px-2 shrink-0 text-[10px] rounded border border-ide-diff-add text-ide-diff-add hover:bg-ide-diff-add-bg"
                  onClick={() => {
                    void applyHunkAction("include");
                  }}
                >
                  {t("git.add")}
                </button>
                <button
                  className="h-7 px-2 shrink-0 text-[10px] rounded border border-ide-border hover:bg-ide-panel"
                  onClick={() => {
                    void applyHunkAction("exclude");
                  }}
                >
                  {t("git.reset")}
                </button>
                <button
                  className="h-7 px-2 shrink-0 text-[10px] rounded border border-ide-diff-del text-ide-diff-del hover:bg-ide-diff-del-bg"
                  onClick={() => {
                    void applyHunkAction("discard");
                  }}
                >
                  {t("git.discard")}
                </button>
              </div>
            )}
          </div>
          <div className="flex-1 overflow-hidden">
            <DesktopDiffView
              diff={fileDiff}
              selectedLineIds={selectedLines}
              selectedHunkIds={selectedHunks}
              onToggleLine={(lineId) => {
                setSelectedLines((prev) => {
                  const next = new Set(prev);
                  if (next.has(lineId)) next.delete(lineId);
                  else next.add(lineId);
                  return next;
                });
              }}
              onToggleHunk={(hunkId) => {
                const hunk = fileDiff.hunks.find((h) => h.id === hunkId);
                if (!hunk) return;
                const selectable = hunk.lines.filter((l) => l.selectable).map((l) => l.id);
                setSelectedHunks((prev) => {
                  const next = new Set(prev);
                  if (next.has(hunkId)) next.delete(hunkId);
                  else next.add(hunkId);
                  return next;
                });
                setSelectedLines((prev) => {
                  const next = new Set(prev);
                  const allSelected = selectable.length > 0 && selectable.every((id) => next.has(id));
                  if (allSelected) {
                    selectable.forEach((id) => next.delete(id));
                  } else {
                    selectable.forEach((id) => next.add(id));
                  }
                  return next;
                });
              }}
            />
          </div>
        </>
      )}
    </div>
  );

  const historyListPane = (
    <div className="h-full flex flex-col bg-ide-bg">
      <div className="shrink-0 h-8 px-3 border-b border-ide-border flex items-center text-[11px] text-ide-mute">
        {commits.length} commits
      </div>
      <div className="flex-1 overflow-y-auto border-b border-ide-border/40">
        {commits.map((commit) => {
          const selected = selectedCommit?.hash === commit.hash;
          return (
            <div
              key={commit.hash}
              className={`px-3 py-2 border-b border-ide-border/30 cursor-pointer hover:bg-ide-panel/40 ${selected ? "bg-ide-panel/50" : ""}`}
              onClick={() => {
                void handleSelectCommit(commit);
              }}
            >
              <div className="text-xs text-ide-text truncate">{firstLine(commit.message)}</div>
              <div className="text-[10px] text-ide-mute flex items-center gap-2 mt-0.5">
                <span>{commit.hash.slice(0, 7)}</span>
                <span>{commit.author}</span>
                <span>{relativeDate(commit.date)}</span>
              </div>
            </div>
          );
        })}
      </div>
      <div className="h-48 overflow-y-auto">
        {selectedCommitFiles.map((f) => (
          <div
            key={f.path}
            className={`px-3 h-8 border-b border-ide-border/30 cursor-pointer flex items-center justify-between hover:bg-ide-panel/40 ${
              selectedHistoryFile === f.path ? "bg-ide-panel/50" : ""
            }`}
            onClick={() => {
              void handleSelectHistoryFile(f.path);
            }}
          >
            <span className="text-xs text-ide-text truncate">{f.path}</span>
            <span className="text-[10px] text-ide-mute">{f.status}</span>
          </div>
        ))}
      </div>
    </div>
  );

  const historyDetailPane = (
    <div className="h-full flex flex-col bg-ide-bg">
      {!historyDiff && <div className="h-full flex items-center justify-center text-sm text-ide-mute">Select file</div>}
      {historyDiff && (
        <>
          <div className="shrink-0 h-10 px-3 border-b border-ide-border flex items-center text-xs text-ide-text truncate">
            {selectedHistoryFile}
          </div>
          <div className="flex-1 grid md:grid-cols-2 overflow-hidden">
            <div className="overflow-auto border-r border-ide-border">
              <pre className="text-[11px] font-mono leading-5 p-3 whitespace-pre">{historyDiff.old}</pre>
            </div>
            <div className="overflow-auto">
              <pre className="text-[11px] font-mono leading-5 p-3 whitespace-pre">{historyDiff.new}</pre>
            </div>
          </div>
        </>
      )}
    </div>
  );

  const stashesListPane = (
    <div className="h-full flex flex-col bg-ide-bg">
      <div className="h-8 px-3 border-b border-ide-border text-[11px] text-ide-mute flex items-center">
        {t("git.stashes")}: {stashes.length}
      </div>
      <div className="flex-1 overflow-y-auto border-b border-ide-border/40">
        {stashes.map((stash) => {
          const selected = selectedStash?.index === stash.index;
          return (
            <div
              key={stash.index}
              className={`px-3 py-2 border-b border-ide-border/30 hover:bg-ide-panel/40 ${selected ? "bg-ide-panel/50" : ""}`}
            >
              <button
                className="w-full text-left"
                onClick={() => {
                  void handleOpenStash(stash);
                }}
              >
                <div className="text-xs text-ide-text truncate">{stash.message}</div>
                <div className="text-[10px] text-ide-mute">stash@{`{${stash.index}}`}</div>
              </button>
              <div className="mt-2 flex items-center gap-2">
                <button
                  className="h-6 px-2 rounded text-[10px] border border-ide-border hover:bg-ide-panel"
                  onClick={() => {
                    void handleStashPop(stash.index);
                  }}
                >
                  {t("git.pop")}
                </button>
                <button
                  className="h-6 px-2 rounded text-[10px] border border-red-500/30 text-red-400 hover:bg-red-500/15"
                  onClick={() => {
                    void handleStashDrop(stash.index);
                  }}
                >
                  {t("git.drop")}
                </button>
              </div>
            </div>
          );
        })}
      </div>
      <div className="h-56 overflow-y-auto">
        {stashFiles.map((f) => (
          <div
            key={f.path}
            className={`px-3 h-8 border-b border-ide-border/30 cursor-pointer flex items-center justify-between hover:bg-ide-panel/40 ${
              selectedStashFile === f.path ? "bg-ide-panel/50" : ""
            }`}
            onClick={() => {
              void handleOpenStashFile(f.path);
            }}
          >
            <span className="text-xs text-ide-text truncate">{f.path}</span>
            <span className={`text-[10px] ${statusColor(f.status)}`}>{statusToShort(f.status)}</span>
          </div>
        ))}
      </div>
    </div>
  );

  const stashesDetailPane = (
    <div className="h-full flex flex-col bg-ide-bg">
      {!stashDiff && <div className="h-full flex items-center justify-center text-sm text-ide-mute">Select file</div>}
      {stashDiff && (
        <>
          <div className="h-10 px-3 border-b border-ide-border flex items-center text-xs text-ide-text truncate">
            {stashDiff.path}
          </div>
          <div className="flex-1 overflow-auto font-mono text-[11px] leading-5">
            <div className="min-w-max">
              {stashDiff.hunks.map((hunk) => (
                <div key={hunk.id} className="border-b border-ide-border/30">
                  <div className="px-3 h-8 bg-ide-panel/50 text-[10px] text-ide-mute flex items-center">{hunk.header}</div>
                  {hunk.lines.map((line, idx) => (
                    <div
                      key={`${hunk.id}-${idx}`}
                      className={`px-3 whitespace-pre ${
                        line.kind === "add"
                          ? "bg-ide-diff-add-bg text-ide-diff-add"
                          : line.kind === "del"
                            ? "bg-ide-diff-del-bg text-ide-diff-del"
                            : "text-ide-text"
                      }`}
                    >
                      {line.content || " "}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );

  const conflictsListPane = (
    <div className="h-full flex flex-col bg-ide-bg">
      <div className="h-8 px-3 border-b border-ide-border text-[11px] text-ide-mute flex items-center">
        {conflicts.length} {t("git.conflicts")}
      </div>
      <div className="flex-1 overflow-y-auto">
        {conflicts.map((filePath) => (
          <div
            key={filePath}
            className={`h-9 px-3 border-b border-ide-border/30 cursor-pointer flex items-center gap-2 hover:bg-ide-panel/40 ${
              selectedConflict === filePath ? "bg-ide-panel/50" : ""
            }`}
            onClick={() => {
              void handleOpenConflict(filePath);
            }}
          >
            <AlertTriangle size={12} className="text-red-400" />
            <span className="text-xs text-ide-text truncate">{filePath}</span>
          </div>
        ))}
      </div>
    </div>
  );

  const conflictsDetailPane = (
    <div className="h-full flex flex-col bg-ide-bg">
      {!conflictDetails && <div className="h-full flex items-center justify-center text-sm text-ide-mute">Select conflict</div>}
      {conflictDetails && (
        <>
          <div className="h-10 px-3 border-b border-ide-border flex items-center justify-between">
            <div className="text-xs text-ide-text truncate">{conflictDetails.path}</div>
            <div className="flex items-center gap-1">
              <button
                className="h-7 px-2 rounded text-[10px] border border-ide-border hover:bg-ide-panel"
                onClick={() => {
                  void handleResolveConflict("ours");
                }}
              >
                Ours
              </button>
              <button
                className="h-7 px-2 rounded text-[10px] border border-ide-border hover:bg-ide-panel"
                onClick={() => {
                  void handleResolveConflict("theirs");
                }}
              >
                Theirs
              </button>
              <button
                className="h-7 px-2 rounded text-[10px] border border-ide-border hover:bg-ide-panel"
                onClick={() => {
                  void handleResolveConflict("manual");
                }}
              >
                {t("git.resolve")}
              </button>
            </div>
          </div>
          <div className="h-8 px-2 border-b border-ide-border flex items-center gap-1">
            {(["ours", "base", "theirs", "manual"] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setConflictTab(tab)}
                className={`h-6 px-2 rounded text-[10px] ${
                  conflictTab === tab ? "bg-ide-accent text-ide-bg" : "text-ide-mute hover:bg-ide-panel"
                }`}
              >
                {tab}
              </button>
            ))}
          </div>
          {conflictTab !== "manual" && (
            <div className="flex-1 overflow-auto">
              <pre className="text-[11px] font-mono leading-5 p-3 whitespace-pre">
                {conflictTab === "ours" && buildConflictContent(conflictDetails, "ours")}
                {conflictTab === "base" && buildConflictContent(conflictDetails, "base")}
                {conflictTab === "theirs" && buildConflictContent(conflictDetails, "theirs")}
              </pre>
            </div>
          )}
          {conflictTab === "manual" && (
            <textarea
              value={manualContent}
              onChange={(e) => setManualContent(e.target.value)}
              className="flex-1 m-3 p-2 rounded bg-ide-panel border border-ide-border text-[11px] text-ide-text font-mono outline-none resize-none"
            />
          )}
        </>
      )}
    </div>
  );

  const activeList =
    activeTab === "changes"
      ? changesListPane
      : activeTab === "history"
        ? historyListPane
        : activeTab === "stashes"
          ? stashesListPane
          : conflictsListPane;

  const activeDetail =
    activeTab === "changes"
      ? changesDetailPane
      : activeTab === "history"
        ? historyDetailPane
        : activeTab === "stashes"
          ? stashesDetailPane
          : conflictsDetailPane;

  const isDetailOpen =
    (activeTab === "changes" && !!fileDiff) ||
    (activeTab === "history" && !!historyDiff) ||
    (activeTab === "stashes" && (!!stashDiff || !!selectedStash)) ||
    (activeTab === "conflicts" && !!conflictDetails);

  return (
    <>
      <div className="h-full flex flex-col bg-ide-bg">
        <div className="h-10 px-3 border-b border-ide-border bg-ide-panel/50 flex items-center gap-2">
          <button
            className="h-7 px-2 rounded border border-ide-border text-xs text-ide-text hover:bg-ide-panel flex items-center gap-1"
            onClick={() => setShowBranchSelector(true)}
            disabled={branches.length === 0}
          >
            <ChevronsUpDown size={12} />
            <span className={`truncate ${isMobile ? "max-w-[96px]" : "max-w-[150px]"}`}>{currentBranch}</span>
          </button>
          <div className="text-[10px] text-ide-mute flex items-center gap-2">
            {aheadCount > 0 && (
              <span className="text-blue-400 flex items-center gap-0.5">
                {aheadCount}
                <ArrowUp size={10} />
              </span>
            )}
            {behindCount > 0 && (
              <span className="text-orange-400 flex items-center gap-0.5">
                {behindCount}
                <ArrowDown size={10} />
              </span>
            )}
          </div>
          <div className="flex-1" />
          <button
            className={`h-7 rounded border border-ide-border text-xs text-ide-text hover:bg-ide-panel flex items-center justify-center gap-1 disabled:opacity-50 ${
              isMobile ? "w-7 px-0" : "px-2"
            }`}
            onClick={() => {
              void handleSmartAction();
            }}
            disabled={running}
          >
            {smartAction.icon}
            {!isMobile && <span>{smartAction.label}</span>}
          </button>
        </div>

        {error && (
          <div className="h-8 px-3 border-b border-red-500/30 bg-red-500/10 text-[11px] text-red-300 flex items-center gap-2">
            <AlertTriangle size={12} />
            <span className="truncate">{error}</span>
          </div>
        )}

        <div className="flex-1 overflow-hidden md:flex">
          <div className={`${isMobile && isDetailOpen ? "hidden" : "block"} md:block md:w-[44%] border-r border-ide-border overflow-hidden`}>
            {activeList}
          </div>
          <div className={`${isMobile ? "hidden" : "block"} md:flex-1 overflow-hidden`}>{activeDetail}</div>
        </div>
      </div>

      {isMobile && isDetailOpen && (
        <div className="fixed inset-0 z-40 bg-ide-bg flex flex-col">
          <div className="h-10 px-2 border-b border-ide-border flex items-center gap-2">
            <button
              className="h-7 w-7 rounded border border-ide-border text-ide-text hover:bg-ide-panel flex items-center justify-center"
              onClick={() => {
                if (activeTab === "changes") {
                  setFileDiff(null);
                  setSelectedFile("");
                }
                if (activeTab === "history") {
                  setHistoryDiff(null);
                  setSelectedHistoryFile("");
                }
                if (activeTab === "stashes") {
                  if (stashDiff) {
                    setStashDiff(null);
                    setSelectedStashFile("");
                  } else {
                    setSelectedStash(null);
                    setStashFiles([]);
                  }
                }
                if (activeTab === "conflicts") {
                  setConflictDetails(null);
                  setSelectedConflict("");
                }
              }}
            >
              <ChevronLeft size={14} />
            </button>
            <div className="flex-1 min-w-0 text-xs text-ide-mute truncate">
              {activeTab === "changes" && selectedFile}
              {activeTab === "history" && selectedHistoryFile}
              {activeTab === "stashes" && (selectedStashFile || selectedStash?.message || "")}
              {activeTab === "conflicts" && selectedConflict}
            </div>
          </div>
          <div className="flex-1 overflow-hidden">{activeDetail}</div>
        </div>
      )}

      <BranchSelector
        isOpen={showBranchSelector}
        branches={branches}
        remoteBranches={remoteBranches}
        currentBranch={currentBranch}
        aheadCount={aheadCount}
        behindCount={behindCount}
        locale={locale}
        onClose={() => setShowBranchSelector(false)}
        onSwitch={(branch) => {
          void switchBranch(branch);
          setShowBranchSelector(false);
        }}
        onCreate={(branch) => {
          void createBranch(branch);
        }}
        onDelete={(branch) => {
          void deleteBranch(branch);
        }}
      />
    </>
  );
};

export default GitView;
