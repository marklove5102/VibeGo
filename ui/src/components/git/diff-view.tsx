import { Square, SquareCheck, SquareMinus } from "lucide-react";
import React, { useMemo } from "react";
import { useIsMobile } from "@/hooks/use-mobile";
import { type GitDiffHunk, type GitDiffRow, type GitSelectionType, parseGitDiff } from "@/lib/git-diff";
import { useGitStore } from "@/stores";

interface DiffViewProps {
  original: string;
  modified: string;
  filename?: string;
  filePath?: string;
  repoPath?: string;
  language?: string;
  allowSelection?: boolean;
}

const getLanguageFromFilename = (filename?: string): string => {
  if (!filename) return "plaintext";
  const ext = filename.split(".").pop()?.toLowerCase();
  const langMap: Record<string, string> = {
    ts: "typescript",
    tsx: "typescript",
    js: "javascript",
    jsx: "javascript",
    json: "json",
    md: "markdown",
    css: "css",
    scss: "scss",
    less: "less",
    html: "html",
    xml: "xml",
    yaml: "yaml",
    yml: "yaml",
    py: "python",
    go: "go",
    rs: "rust",
    java: "java",
    c: "c",
    cpp: "cpp",
    h: "c",
    hpp: "cpp",
    sh: "shell",
    bash: "shell",
    sql: "sql",
    graphql: "graphql",
    vue: "vue",
    svelte: "svelte",
    php: "php",
    rb: "ruby",
    swift: "swift",
    kt: "kotlin",
    scala: "scala",
    lua: "lua",
    r: "r",
    toml: "toml",
    ini: "ini",
    dockerfile: "dockerfile",
    makefile: "makefile",
  };
  return langMap[ext || ""] || "plaintext";
};

const getSelectionIcon = (selectionType: GitSelectionType, size: number, className: string) => {
  if (selectionType === "all") {
    return <SquareCheck size={size} className={className} />;
  }
  if (selectionType === "partial") {
    return <SquareMinus size={size} className={className} />;
  }
  return <Square size={size} className={className} />;
};

const getHunkSelectionType = (hunk: GitDiffHunk, selectedRowIds: Set<string>): GitSelectionType => {
  if (hunk.selectableRowIds.length === 0) {
    return "none";
  }
  const selectedCount = hunk.selectableRowIds.filter((rowId) => selectedRowIds.has(rowId)).length;
  if (selectedCount === 0) {
    return "none";
  }
  if (selectedCount === hunk.selectableRowIds.length) {
    return "all";
  }
  return "partial";
};

const getRowSelectionType = (row: GitDiffRow, selectedRowIds: Set<string>): GitSelectionType => {
  if (!row.selectable) {
    return "none";
  }
  return selectedRowIds.has(row.id) ? "all" : "none";
};

const getSelectionSurfaceClassName = (row: GitDiffRow, selected: boolean, interactive: boolean) => {
  if (row.type === "added") {
    if (!interactive) {
      return "bg-green-500/20";
    }
    return selected ? "bg-green-500/12 hover:bg-green-500/18" : "bg-green-500/5 hover:bg-green-500/10";
  }
  if (row.type === "removed") {
    if (!interactive) {
      return "bg-red-500/20";
    }
    return selected ? "bg-red-500/12 hover:bg-red-500/18" : "bg-red-500/5 hover:bg-red-500/10";
  }
  return interactive ? "bg-ide-bg hover:bg-ide-panel/40" : "bg-ide-bg";
};

const getSelectionClassName = (row: GitDiffRow, selected: boolean, interactive: boolean) => {
  const surfaceClassName = getSelectionSurfaceClassName(row, selected, interactive);
  if (row.type === "added" || row.type === "removed") {
    if (!interactive) {
      return `${surfaceClassName} text-ide-text`;
    }
    return selected ? surfaceClassName : `${surfaceClassName} text-ide-mute/80`;
  }
  return surfaceClassName;
};

const DiffView: React.FC<DiffViewProps> = ({
  original,
  modified,
  filename,
  filePath,
  language,
  allowSelection = false,
}) => {
  const checkedFiles = useGitStore((state) => state.checkedFiles);
  const partialSelection = useGitStore((state) => (filePath ? state.partialSelections[filePath] : undefined));
  const setPartialSelection = useGitStore((state) => state.setPartialSelection);
  const toggleFile = useGitStore((state) => state.toggleFile);
  const isMobile = useIsMobile();

  const detectedLanguage = useMemo(() => language || getLanguageFromFilename(filename), [language, filename]);
  const parsedDiff = useMemo(() => parseGitDiff(original, modified), [original, modified]);
  const diffStats = useMemo(() => {
    const rows = parsedDiff.hunks.flatMap((hunk) => hunk.rows);
    return {
      added: rows.filter((row) => row.type === "added").length,
      removed: rows.filter((row) => row.type === "removed").length,
    };
  }, [parsedDiff]);

  const interactive = allowSelection && Boolean(filePath);
  const fileSelectionType = useMemo<GitSelectionType>(() => {
    if (!interactive || !filePath) {
      return "none";
    }
    if (partialSelection) {
      return "partial";
    }
    return checkedFiles.has(filePath) ? "all" : "none";
  }, [checkedFiles, filePath, interactive, partialSelection]);

  const selectedRowIds = useMemo(() => {
    if (!interactive || !filePath) {
      return new Set<string>();
    }
    if (partialSelection) {
      return new Set(partialSelection.selectedRowIds);
    }
    if (checkedFiles.has(filePath)) {
      return new Set(parsedDiff.selectableRowIds);
    }
    return new Set<string>();
  }, [checkedFiles, filePath, interactive, parsedDiff.selectableRowIds, partialSelection]);

  const maxMobileContentColumns = useMemo(() => {
    if (!isMobile) {
      return 0;
    }
    const lineLengths = parsedDiff.hunks.flatMap((hunk) => [
      hunk.header.length,
      ...hunk.rows.map((row) => row.content.length + 2),
    ]);
    return Math.max(24, ...lineLengths);
  }, [isMobile, parsedDiff.hunks]);

  const diffContentWrapperClassName = isMobile ? "min-w-full" : "";
  const diffContentWrapperStyle = isMobile ? { minWidth: `calc(${maxMobileContentColumns}ch + 60px)` } : undefined;
  const diffRowClassName = isMobile
    ? `w-full flex items-stretch transition-colors ${interactive ? "text-left" : "select-text"}`
    : `w-full grid grid-cols-[26px_56px_56px_minmax(0,1fr)] items-start gap-2 px-2 py-0.5 transition-colors ${interactive ? "text-left" : "select-text"}`;
  const diffLeftPaneClassName = isMobile
    ? "sticky left-0 z-10 flex shrink-0 self-stretch items-center gap-0 border-r border-ide-border bg-inherit px-0.5"
    : "contents";
  const diffCheckboxClassName = isMobile
    ? "h-5 w-3 flex items-center justify-center"
    : "h-5 flex items-center justify-center";
  const diffLineNumberClassName = isMobile
    ? "h-5 w-[26px] flex items-center justify-end text-[8px] text-ide-mute/60 tabular-nums"
    : "h-5 flex items-center justify-end text-ide-mute/70 tabular-nums";
  const diffPrefixClassName = isMobile
    ? "inline-block w-2 shrink-0 text-ide-mute/70"
    : "inline-block w-3 shrink-0 text-ide-mute/70";
  const diffContentClassName = isMobile
    ? "flex-1 min-w-0 px-2 leading-5 whitespace-pre"
    : "leading-5 whitespace-pre-wrap break-words min-w-0";
  const diffBodyClassName = isMobile
    ? "flex-1 overflow-auto font-mono text-[11px]"
    : "flex-1 overflow-auto font-mono text-xs";
  const hunkHeaderClassName = isMobile
    ? `w-full flex items-stretch bg-ide-panel border-b border-ide-border sticky top-0 z-10 ${interactive ? "cursor-pointer" : ""}`
    : "flex items-center gap-2 bg-ide-panel/40 border-b border-ide-border/50 sticky top-0 z-10 px-2 py-1";
  const hunkHeaderLeftClassName = isMobile
    ? "sticky left-0 z-10 flex shrink-0 self-stretch items-center gap-0 border-r border-ide-border bg-ide-panel px-0.5"
    : "flex items-center gap-2";
  const hunkHeaderTextClassName = isMobile ? "px-2 py-0.75 text-[11px] text-ide-accent" : "text-[11px] text-ide-accent";

  const handleRowToggle = (rowId: string) => {
    if (!interactive || !filePath) {
      return;
    }
    const nextSelectedRowIds = new Set(selectedRowIds);
    if (nextSelectedRowIds.has(rowId)) {
      nextSelectedRowIds.delete(rowId);
    } else {
      nextSelectedRowIds.add(rowId);
    }
    setPartialSelection(filePath, Array.from(nextSelectedRowIds), parsedDiff.selectableRowIds);
  };

  const handleHunkToggle = (hunk: GitDiffHunk) => {
    if (!interactive || !filePath || hunk.selectableRowIds.length === 0) {
      return;
    }
    const nextSelectedRowIds = new Set(selectedRowIds);
    const hunkSelectionType = getHunkSelectionType(hunk, selectedRowIds);
    if (hunkSelectionType === "none") {
      for (const rowId of hunk.selectableRowIds) {
        nextSelectedRowIds.add(rowId);
      }
    } else {
      for (const rowId of hunk.selectableRowIds) {
        nextSelectedRowIds.delete(rowId);
      }
    }
    setPartialSelection(filePath, Array.from(nextSelectedRowIds), parsedDiff.selectableRowIds);
  };

  return (
    <div className="h-full flex flex-col bg-ide-bg">
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-ide-border bg-ide-panel/50 gap-3">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          {interactive && (
            <button
              type="button"
              className="shrink-0"
              onClick={() => {
                if (filePath) {
                  toggleFile(filePath);
                }
              }}
            >
              {getSelectionIcon(
                fileSelectionType,
                16,
                fileSelectionType === "none" ? "text-ide-mute" : "text-ide-accent"
              )}
            </button>
          )}
          <span className="text-xs text-ide-text font-medium truncate">{filePath || filename || "Diff View"}</span>
          <span className="text-[10px] text-ide-mute/60 bg-ide-bg px-1.5 py-0.5 rounded shrink-0">
            {detectedLanguage}
          </span>
          {(diffStats.added > 0 || diffStats.removed > 0) && (
            <span className="text-[10px] shrink-0">
              {diffStats.added > 0 && <span className="text-green-400">+{diffStats.added}</span>}
              {diffStats.added > 0 && diffStats.removed > 0 && <span className="text-ide-mute mx-0.5">/</span>}
              {diffStats.removed > 0 && <span className="text-red-400">-{diffStats.removed}</span>}
            </span>
          )}
        </div>
        {interactive && (
          <div className="text-[10px] text-ide-mute shrink-0">
            {selectedRowIds.size}/{parsedDiff.selectableRowIds.length}
          </div>
        )}
      </div>

      <div className={diffBodyClassName} style={isMobile ? { overscrollBehaviorX: "contain" } : undefined}>
        {parsedDiff.hunks.length === 0 ? (
          <div className="h-full flex items-center justify-center text-ide-mute">No changes</div>
        ) : (
          <div className={diffContentWrapperClassName} style={diffContentWrapperStyle}>
            {parsedDiff.hunks.map((hunk) => (
              <div key={hunk.id} className="border-b border-ide-border/60 last:border-b-0">
                <div
                  className={hunkHeaderClassName}
                  onClick={() => {
                    if (isMobile && interactive) {
                      handleHunkToggle(hunk);
                    }
                  }}
                >
                  <div className={hunkHeaderLeftClassName}>
                    <span className={diffCheckboxClassName} />
                    <span className={diffLineNumberClassName} />
                    <span className={diffLineNumberClassName} />
                  </div>
                  <span className={hunkHeaderTextClassName}>{hunk.header}</span>
                </div>

                {hunk.rows
                  .filter((row) => row.type !== "hunk")
                  .map((row) => {
                    const rowSelectionType = getRowSelectionType(row, selectedRowIds);
                    const selected = rowSelectionType === "all";
                    const rowContent = (
                      <>
                        <div
                          className={`${diffLeftPaneClassName} ${getSelectionSurfaceClassName(row, selected, interactive)}`}
                        >
                          <span className={diffCheckboxClassName}>
                            {interactive && row.selectable
                              ? getSelectionIcon(rowSelectionType, 13, selected ? "text-ide-accent" : "text-ide-mute")
                              : null}
                          </span>
                          <span className={diffLineNumberClassName}>{row.oldLineNumber ?? ""}</span>
                          <span className={diffLineNumberClassName}>{row.newLineNumber ?? ""}</span>
                        </div>
                        <span className={diffContentClassName}>
                          <span className={diffPrefixClassName}>
                            {row.type === "added" ? "+" : row.type === "removed" ? "-" : " "}
                          </span>
                          <span>{row.content || " "}</span>
                        </span>
                      </>
                    );

                    if (interactive) {
                      return (
                        <button
                          type="button"
                          key={row.id}
                          className={`${diffRowClassName} ${getSelectionClassName(row, selected, interactive)}`}
                          onClick={() => {
                            if (row.selectable) {
                              handleRowToggle(row.id);
                            }
                          }}
                        >
                          {rowContent}
                        </button>
                      );
                    }

                    return (
                      <div
                        key={row.id}
                        className={`${diffRowClassName} ${getSelectionClassName(row, selected, interactive)}`}
                      >
                        {rowContent}
                      </div>
                    );
                  })}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default DiffView;
