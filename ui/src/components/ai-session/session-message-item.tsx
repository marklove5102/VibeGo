import { ChevronDown, ChevronUp, Copy } from "lucide-react";
import React from "react";
import {
  formatDateTime,
  renderHighlightedText,
  roleLabel,
  roleLabelTone,
  roleTone,
} from "@/components/ai-session/utils";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { AISessionMessage } from "@/types/ai-session";

const COLLAPSE_THRESHOLD = 3000;
const COLLAPSED_LENGTH = 1500;

interface SessionMessageItemProps {
  active: boolean;
  locale: "en" | "zh";
  message: AISessionMessage;
  query: string;
  t: (key: string) => string;
  onCopy: (content: string) => void;
}

const SessionMessageItem: React.FC<SessionMessageItemProps> = ({ active, locale, message, query, t, onCopy }) => {
  const [expanded, setExpanded] = React.useState(false);
  const isLong = message.content.length > COLLAPSE_THRESHOLD;
  const hasSearchMatch =
    isLong && !expanded && query.trim() && message.content.toLowerCase().includes(query.trim().toLowerCase());
  const collapsed = isLong && !expanded && !hasSearchMatch;
  const displayContent = collapsed ? `${message.content.slice(0, COLLAPSED_LENGTH)}...` : message.content;

  return (
    <div
      className={cn(
        "max-w-full overflow-hidden rounded-md border px-3 py-3",
        roleTone(message.role),
        active ? "ring-2 ring-ide-accent/40" : ""
      )}
    >
      <div className="mb-2 flex min-w-0 items-center justify-between gap-2 text-xs">
        <span
          className={cn(
            "inline-flex min-w-0 shrink rounded-md border px-1.5 py-0.5 text-[11px] font-medium",
            roleLabelTone(message.role)
          )}
        >
          {roleLabel(message.role, t)}
        </span>
        <div className="flex shrink-0 items-center gap-1">
          <span className="max-w-[40vw] truncate text-ide-mute">{formatDateTime(message.ts, locale)}</span>
          <Button variant="ghost" size="icon-xs" onClick={() => onCopy(message.content)}>
            <Copy size={12} />
          </Button>
        </div>
      </div>
      <div className="max-w-full overflow-hidden whitespace-pre-wrap break-words text-sm leading-6 text-ide-text">
        {renderHighlightedText(displayContent, query)}
      </div>
      {isLong && !hasSearchMatch ? (
        <button
          type="button"
          aria-expanded={expanded}
          onClick={() => setExpanded((value) => !value)}
          className="mt-2 inline-flex items-center gap-1 text-xs text-ide-mute transition-colors hover:text-ide-text"
        >
          {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          {expanded ? t("plugin.aiSessionManager.collapseContent") : t("plugin.aiSessionManager.expandContent")}
        </button>
      ) : null}
    </div>
  );
};

export default SessionMessageItem;
