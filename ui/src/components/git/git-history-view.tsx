import { ChevronDown, ChevronRight, Clock, GitCommit as GitCommitIcon, Undo2 } from "lucide-react";
import React, { useCallback, useState } from "react";
import type { CommitFileInfo, GitCommit } from "@/api/git";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { getIntlLocale, getTranslation, type Locale } from "@/lib/i18n";

interface GitHistoryViewProps {
  commits: GitCommit[];
  isLoading: boolean;
  locale: Locale;
  onCommitSelect: (commit: GitCommit) => void;
  onUndoCommit: (commit: GitCommit) => void;
  onFileClick: (commit: GitCommit, filePath: string) => void;
  selectedCommitFiles: CommitFileInfo[];
  selectedCommitHash: string | null;
}

const formatRelativeTime = (dateStr: string, locale: Locale, t: (key: string) => string): string => {
  const date = new Date(dateStr);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  if (days > 30) return date.toLocaleDateString(getIntlLocale(locale));
  if (days > 0) return t("time.daysAgoShort").replace("{count}", String(days));
  if (hours > 0) return t("time.hoursAgoShort").replace("{count}", String(hours));
  if (minutes > 0) return t("time.minutesAgoShort").replace("{count}", String(minutes));
  return t("time.now");
};

const getStatusColor = (status: string) => {
  switch (status) {
    case "M":
    case "modified":
      return "text-yellow-500";
    case "A":
    case "added":
      return "text-green-500";
    case "D":
    case "deleted":
      return "text-red-500";
    default:
      return "text-ide-mute";
  }
};

const getInitials = (name: string) => {
  const parts = name.split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.substring(0, 2).toUpperCase();
};

const hashColor = (name: string) => {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
  const colors = ["bg-blue-500", "bg-green-500", "bg-purple-500", "bg-orange-500", "bg-pink-500", "bg-teal-500"];
  return colors[Math.abs(h) % colors.length];
};

const getAuthorAvatarUrl = (email: string) => {
  const trimmedEmail = email.trim();
  if (!trimmedEmail) return undefined;
  return `https://avatars.githubusercontent.com/u/e?email=${encodeURIComponent(trimmedEmail)}&s=64`;
};

interface CommitItemProps {
  commit: GitCommit;
  isExpanded: boolean;
  isSelected: boolean;
  locale: Locale;
  canUndoCommit: boolean;
  isLoading: boolean;
  onToggle: () => void;
  onUndoCommit: () => void;
  onFileClick: (filePath: string) => void;
  files: CommitFileInfo[];
}

const CommitItem: React.FC<CommitItemProps> = ({
  commit,
  isExpanded,
  isSelected,
  locale,
  canUndoCommit,
  isLoading,
  onToggle,
  onUndoCommit,
  onFileClick,
  files,
}) => {
  const t = useCallback((key: string) => getTranslation(locale, key), [locale]);
  const shortHash = commit.hash.substring(0, 7);
  const firstLine = commit.message.split("\n")[0];
  const authorAvatarUrl = getAuthorAvatarUrl(commit.authorEmail);

  return (
    <div className={`border-b border-ide-border/50 ${isSelected ? "bg-ide-accent/5" : ""}`}>
      <div
        className="flex items-start gap-2.5 px-3 py-2.5 cursor-pointer hover:bg-ide-accent/10 active:bg-ide-accent/15"
        onClick={onToggle}
      >
        <Avatar className="mt-0.5 size-7 shrink-0">
          {authorAvatarUrl ? <AvatarImage src={authorAvatarUrl} alt={commit.author} /> : null}
          <AvatarFallback className={`${hashColor(commit.author)} text-[10px] font-bold text-white`}>
            {getInitials(commit.author)}
          </AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          <div className="text-sm text-ide-text font-medium truncate">{firstLine}</div>
          <div className="flex items-center gap-2 mt-0.5 text-[10px] text-ide-mute">
            <span>{commit.author}</span>
            <span className="flex items-center gap-0.5">
              <Clock size={9} />
              {formatRelativeTime(commit.date, locale, t)}
            </span>
            <span className="flex items-center gap-0.5 font-mono">
              <GitCommitIcon size={9} />
              {shortHash}
            </span>
          </div>
        </div>
        <div className="pt-1">
          {isExpanded ? (
            <ChevronDown size={14} className="text-ide-mute" />
          ) : (
            <ChevronRight size={14} className="text-ide-mute" />
          )}
        </div>
      </div>

      {isExpanded && (files.length > 0 || canUndoCommit) && (
        <div className="bg-ide-panel/30 border-t border-ide-border/30">
          <div className="px-3 py-1 flex items-center justify-between gap-2 text-[10px] text-ide-mute">
            <span>
              {files.length} {t("git.filesChanged")}
            </span>
            {canUndoCommit && (
              <button
                className="px-2 py-0.5 rounded flex items-center gap-1 text-ide-accent hover:bg-ide-accent/10 disabled:opacity-50"
                onClick={(e) => {
                  e.stopPropagation();
                  onUndoCommit();
                }}
                disabled={isLoading}
              >
                <Undo2 size={10} />
                {t("git.undoCommit")}
              </button>
            )}
          </div>
          {files.map((file) => (
            <div
              key={file.path}
              className="flex items-center gap-2 px-4 py-1 hover:bg-ide-accent/10 cursor-pointer active:bg-ide-accent/15"
              onClick={(e) => {
                e.stopPropagation();
                onFileClick(file.path);
              }}
            >
              <span className={`w-3 text-center font-bold text-[10px] ${getStatusColor(file.status)}`}>
                {file.status[0]?.toUpperCase() || "?"}
              </span>
              <span className="text-xs text-ide-text truncate">{file.path}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const GitHistoryView: React.FC<GitHistoryViewProps> = ({
  commits,
  isLoading,
  locale,
  onCommitSelect,
  onUndoCommit,
  onFileClick,
  selectedCommitFiles,
  selectedCommitHash,
}) => {
  const t = useCallback((key: string) => getTranslation(locale, key), [locale]);
  const [expandedHash, setExpandedHash] = useState<string | null>(null);

  const handleToggle = useCallback(
    (commit: GitCommit) => {
      if (expandedHash === commit.hash) {
        setExpandedHash(null);
      } else {
        setExpandedHash(commit.hash);
        onCommitSelect(commit);
      }
    },
    [expandedHash, onCommitSelect]
  );

  if (isLoading && commits.length === 0) {
    return <div className="flex items-center justify-center h-32 text-ide-mute text-sm">{t("git.loading")}</div>;
  }

  if (commits.length === 0) {
    return <div className="flex items-center justify-center h-32 text-ide-mute text-sm">{t("git.noCommits")}</div>;
  }

  return (
    <div className="h-full overflow-y-auto bg-ide-bg">
      {commits.map((commit, index) => (
        <CommitItem
          key={commit.hash}
          commit={commit}
          isExpanded={expandedHash === commit.hash}
          isSelected={selectedCommitHash === commit.hash}
          locale={locale}
          canUndoCommit={index === 0 && commit.parentCount > 0}
          isLoading={isLoading}
          onToggle={() => handleToggle(commit)}
          onUndoCommit={() => onUndoCommit(commit)}
          onFileClick={(path) => onFileClick(commit, path)}
          files={expandedHash === commit.hash ? selectedCommitFiles : []}
        />
      ))}
    </div>
  );
};

export default GitHistoryView;
