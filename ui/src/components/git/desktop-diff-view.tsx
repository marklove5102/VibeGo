import React from "react";
import type { GitInteractiveDiffV2 } from "@/api/git";
import { useIsMobile } from "@/hooks/use-mobile";

interface DesktopDiffViewProps {
  diff: GitInteractiveDiffV2 | null;
  readOnly?: boolean;
  selectedLineIds?: Set<string>;
  selectedHunkIds?: Set<string>;
  onToggleLine?: (lineId: string) => void;
  onToggleHunk?: (hunkId: string) => void;
}

const DesktopDiffView: React.FC<DesktopDiffViewProps> = ({
  diff,
  readOnly = false,
  selectedLineIds,
  selectedHunkIds,
  onToggleLine,
  onToggleHunk,
}) => {
  const isMobile = useIsMobile();
  if (!diff) {
    return <div className="h-full flex items-center justify-center text-sm text-ide-mute">No diff</div>;
  }

  const canSelectLine = !readOnly && diff.capability.lineSelectable && !!selectedLineIds && !!onToggleLine;
  const canSelectHunk = !readOnly && !!selectedHunkIds && !!onToggleHunk;
  const desktopLineNumCell = "w-12 shrink-0 px-2 text-right text-[11px] text-ide-mute/80 select-none";
  const mobileLineNumCell = "w-10 shrink-0 px-2 text-right text-[11px] text-ide-mute/80 select-none";

  return (
    <div className="h-full flex flex-col bg-ide-bg text-ide-text">
      <div className={`flex-1 overflow-auto font-mono ${isMobile ? "text-[11px] leading-6" : "text-[12px] leading-6"}`}>
        {diff.binary && <div className="p-4 text-xs text-ide-mute">Binary file</div>}
        {!diff.binary && diff.hunks.length === 0 && <div className="p-4 text-xs text-ide-mute">No hunks</div>}

        {!diff.binary && (
          <div className={isMobile ? "min-w-[560px]" : "min-w-[760px]"}>
            {diff.hunks.map((hunk) => {
              const hunkSelected = !!selectedHunkIds?.has(hunk.id);
              return (
                <div key={hunk.id} className="border-b border-ide-border/70">
                  <div className="h-7 px-2 bg-ide-panel/45 border-b border-ide-border/40 flex items-center gap-2 text-[10px] text-ide-mute">
                    <div className="w-6 shrink-0 flex items-center justify-center">
                      {canSelectHunk && (
                        <button
                          onClick={() => onToggleHunk?.(hunk.id)}
                          className={`h-3.5 w-3.5 rounded-sm border flex items-center justify-center text-[9px] ${
                            hunkSelected
                              ? "bg-ide-accent border-ide-accent text-ide-on-accent"
                              : "border-ide-border text-transparent hover:border-ide-accent/70"
                          }`}
                        >
                          ✓
                        </button>
                      )}
                    </div>
                    <div className="truncate">{hunk.header}</div>
                  </div>

                  {hunk.lines.map((line) => {
                    const lineSelected = !!selectedLineIds?.has(line.id);
                    const style =
                      line.kind === "add"
                        ? { backgroundColor: "var(--ide-diff-add-bg)" }
                        : line.kind === "del"
                          ? { backgroundColor: "var(--ide-diff-del-bg)" }
                          : undefined;
                    const sign = line.kind === "add" ? "+" : line.kind === "del" ? "-" : " ";
                    const signColor =
                      line.kind === "add"
                        ? "text-ide-diff-add"
                        : line.kind === "del"
                          ? "text-ide-diff-del"
                          : "text-ide-mute/70";

                    return (
                      <div
                        key={line.id}
                        style={style}
                        className="flex items-stretch border-t border-ide-border/30"
                      >
                        <div className="w-6 shrink-0 flex items-center justify-center bg-ide-panel/45 border-r border-ide-border/40">
                          {line.selectable && canSelectLine && (
                            <button
                              onClick={() => onToggleLine?.(line.id)}
                              className={`h-3.5 w-3.5 rounded-sm border flex items-center justify-center text-[9px] ${
                                lineSelected
                                  ? "bg-ide-accent border-ide-accent text-ide-on-accent"
                                  : "border-ide-border text-transparent hover:border-ide-accent/70"
                              }`}
                            >
                              ✓
                            </button>
                          )}
                        </div>

                        {!isMobile && <div className={desktopLineNumCell}>{line.oldLine > 0 ? line.oldLine : ""}</div>}
                        {isMobile ? (
                          <div className={mobileLineNumCell}>
                            {line.newLine > 0 ? line.newLine : line.oldLine > 0 ? line.oldLine : ""}
                          </div>
                        ) : (
                          <div className={desktopLineNumCell}>{line.newLine > 0 ? line.newLine : ""}</div>
                        )}

                        <div className="flex-1 min-w-0 px-2 whitespace-pre text-[12px] text-ide-text">
                          <span className={`inline-block w-3 ${signColor}`}>{sign}</span>
                          {line.content.length > 0 ? line.content.slice(1) : " "}
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default DesktopDiffView;
