import { ListTree } from "lucide-react";
import { cn } from "@/lib/utils";

interface SessionOutlineItem {
  index: number;
  content: string;
}

interface SessionOutlineProps {
  compact: boolean;
  items: SessionOutlineItem[];
  t: (key: string) => string;
  onSelect: (index: number) => void;
}

const SessionOutline: React.FC<SessionOutlineProps> = ({ compact, items, t, onSelect }) => {
  return (
    <div
      className={cn("space-y-2 bg-ide-bg", compact ? "p-4" : "min-h-0 overflow-y-auto border-l border-ide-border p-4")}
    >
      <div className="flex items-center gap-2 text-sm font-medium text-ide-text">
        <ListTree size={16} />
        <span>{t("plugin.aiSessionManager.outline")}</span>
      </div>
      <div className="space-y-2">
        {items.length === 0 ? (
          <div className="rounded-md border border-ide-border bg-ide-panel px-3 py-4 text-xs text-ide-mute">
            {t("plugin.aiSessionManager.noOutline")}
          </div>
        ) : (
          items.map((item, index) => (
            <button
              key={`${item.index}-${index}`}
              type="button"
              onClick={() => onSelect(item.index)}
              className="w-full rounded-md border border-ide-border bg-ide-panel px-3 py-2 text-left text-xs text-ide-mute transition-colors hover:border-ide-accent/40 hover:bg-ide-bg hover:text-ide-text"
            >
              <div className="line-clamp-2">{item.content}</div>
            </button>
          ))
        )}
      </div>
    </div>
  );
};

export default SessionOutline;
