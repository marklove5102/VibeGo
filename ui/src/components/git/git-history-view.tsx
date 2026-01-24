import { ChevronDown, ChevronRight, Clock, GitCommit as GitCommitIcon } from "lucide-react";
import React, { useCallback, useState } from "react";
import type { GitCommit } from "@/api/git";
import type { CommitFileInfo } from "@/api/git";
import type { Locale } from "@/stores/app-store";

interface GitHistoryViewProps {
  commits: GitCommit[];
  isLoading: boolean;
  locale: Locale;
  onCommitSelect: (commit: GitCommit) => void;
  onFileClick: (commit: GitCommit, filePath: string) => void;
  selectedCommitFiles: CommitFileInfo[];
  selectedCommitHash: string | null;
}

const i18n = {
  en: { noCommits: "No commits yet", loading: "Loading...", filesChanged: "files changed" },
  zh: { noCommits: "No commits yet", loading: "Loading...", filesChanged: "files changed" },
};

const formatRelativeTime = (dateStr: string): string => {
  const date = new Date(dateStr);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  if (days > 30) return date.toLocaleDateString();
  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  if (minutes > 0) return `${minutes}m ago`;
  return "just now";
};

const getStatusColor = (status: string) => {
  switch (status) {
    case "M": case "modified": return "text-yellow-500";
    case "A": case "added": return "text-green-500";
    case "D": case "deleted": return "text-red-500";
    default: return "text-ide-mute";
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

interface CommitItemProps {
  commit: GitCommit;
  isExpanded: boolean;
  isSelected: boolean;
  onToggle: () => void;
  onFileClick: (filePath: string) => void;
  files: CommitFileInfo[];
}

const CommitItem: React.FC<CommitItemProps> = ({ commit, isExpanded, isSelected, onToggle, onFileClick, files }) => {
  const shortHash = commit.hash.substring(0, 7);
  const firstLine = commit.message.split("\n")[0];

  return (
    <div className={`border-b border-ide-border/50 ${isSelected ? "bg-ide-accent/5" : ""}`}>
      <div className="flex items-start gap-2.5 px-3 py-2.5 cursor-pointer hover:bg-ide-accent/10 active:bg-ide-accent/15" onClick={onToggle}>
        <div className={`w-7 h-7 rounded-full ${hashColor(commit.author)} flex items-center justify-center shrink-0 mt-0.5`}>
          <span className="text-[10px] font-bold text-white">{getInitials(commit.author)}</span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm text-ide-text font-medium truncate">{firstLine}</div>
          <div className="flex items-center gap-2 mt-0.5 text-[10px] text-ide-mute">
            <span>{commit.author}</span>
            <span className="flex items-center gap-0.5">
              <Clock size={9} />
              {formatRelativeTime(commit.date)}
            </span>
            <span className="flex items-center gap-0.5 font-mono">
              <GitCommitIcon size={9} />
              {shortHash}
            </span>
          </div>
        </div>
        <div className="pt-1">
          {isExpanded ? <ChevronDown size={14} className="text-ide-mute" /> : <ChevronRight size={14} className="text-ide-mute" />}
        </div>
      </div>

      {isExpanded && files.length > 0 && (
        <div className="bg-ide-panel/30 border-t border-ide-border/30">
          <div className="px-3 py-1 text-[10px] text-ide-mute">
            {files.length} {i18n.en.filesChanged}
          </div>
          {files.map((file) => (
            <div
              key={file.path}
              className="flex items-center gap-2 px-4 py-1 hover:bg-ide-accent/10 cursor-pointer active:bg-ide-accent/15"
              onClick={(e) => { e.stopPropagation(); onFileClick(file.path); }}
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
  onFileClick,
  selectedCommitFiles,
  selectedCommitHash,
}) => {
  const t = i18n[locale] || i18n.en;
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
    return <div className="flex items-center justify-center h-32 text-ide-mute text-sm">{t.loading}</div>;
  }

  if (commits.length === 0) {
    return <div className="flex items-center justify-center h-32 text-ide-mute text-sm">{t.noCommits}</div>;
  }

  return (
    <div className="h-full overflow-y-auto bg-ide-bg">
      {commits.map((commit) => (
        <CommitItem
          key={commit.hash}
          commit={commit}
          isExpanded={expandedHash === commit.hash}
          isSelected={selectedCommitHash === commit.hash}
          onToggle={() => handleToggle(commit)}
          onFileClick={(path) => onFileClick(commit, path)}
          files={expandedHash === commit.hash ? selectedCommitFiles : []}
        />
      ))}
    </div>
  );
};

export default GitHistoryView;
