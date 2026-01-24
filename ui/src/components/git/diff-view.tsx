import { DiffEditor } from "@monaco-editor/react";
import { Columns2, Plus, Rows2 } from "lucide-react";
import React, { useMemo, useRef, useState } from "react";
import type * as Monaco from "monaco-editor";
import "@/lib/monaco";
import { useAppStore } from "@/stores/app-store";

interface DiffViewProps {
  original: string;
  modified: string;
  filename?: string;
  language?: string;
  allowPartialStaging?: boolean;
  onStageSelected?: (patch: string) => void;
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

const DiffView: React.FC<DiffViewProps> = ({ 
  original, 
  modified, 
  filename, 
  language,
  allowPartialStaging = false,
  onStageSelected,
}) => {
  const appTheme = useAppStore((s) => s.theme);
  const [renderSideBySide, setRenderSideBySide] = useState(true);
  const editorRef = useRef<Monaco.editor.IStandaloneDiffEditor | null>(null);
  const [hasSelection, setHasSelection] = useState(false);
  const modelIdRef = useRef(`git-diff-${Date.now()}-${Math.random().toString(36).slice(2)}`);

  const editorTheme = useMemo(() => {
    return appTheme === "light" ? "light" : "vs-dark";
  }, [appTheme]);

  const detectedLanguage = useMemo(() => {
    return language || getLanguageFromFilename(filename);
  }, [language, filename]);

  const generatePatch = () => {
    if (!editorRef.current || !filename) return;

    const modifiedEditor = editorRef.current.getModifiedEditor();
    const selection = modifiedEditor.getSelection();
    
    if (!selection || selection.isEmpty()) {
      return;
    }

    const startLine = selection.startLineNumber;
    const endLine = selection.endLineNumber;
    const originalLines = original.split("\n");
    const modifiedLines = modified.split("\n");

    let patch = `--- a/${filename}\n+++ b/${filename}\n`;
    patch += `@@ -${startLine},${endLine - startLine + 1} +${startLine},${endLine - startLine + 1} @@\n`;

    for (let i = startLine - 1; i <= endLine - 1 && i < modifiedLines.length; i++) {
      const origLine = originalLines[i] || "";
      const modLine = modifiedLines[i] || "";
      
      if (origLine === modLine) {
        patch += ` ${modLine}\n`;
      } else {
        if (origLine) patch += `-${origLine}\n`;
        if (modLine) patch += `+${modLine}\n`;
      }
    }

    onStageSelected?.(patch);
  };

  return (
    <div className="h-full flex flex-col bg-ide-bg">
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-ide-border bg-ide-panel/50">
        <div className="flex items-center gap-2">
          <span className="text-xs text-ide-mute font-medium">
            {filename || "Diff View"}
          </span>
          <span className="text-[10px] text-ide-mute/60 bg-ide-bg px-1.5 py-0.5 rounded">
            {detectedLanguage}
          </span>
        </div>
        <div className="flex items-center gap-1">
          {allowPartialStaging && hasSelection && (
            <button
              onClick={generatePatch}
              className="px-2 py-1 text-xs bg-green-500/20 text-green-400 rounded hover:bg-green-500/30 flex items-center gap-1 mr-2"
            >
              <Plus size={12} />
              Stage Selection
            </button>
          )}
          <button
            onClick={() => setRenderSideBySide(true)}
            className={`p-1.5 rounded transition-colors ${
              renderSideBySide
                ? "bg-ide-accent/20 text-ide-accent"
                : "text-ide-mute hover:bg-ide-accent/10 hover:text-ide-text"
            }`}
            title="Side by Side"
          >
            <Columns2 size={14} />
          </button>
          <button
            onClick={() => setRenderSideBySide(false)}
            className={`p-1.5 rounded transition-colors ${
              !renderSideBySide
                ? "bg-ide-accent/20 text-ide-accent"
                : "text-ide-mute hover:bg-ide-accent/10 hover:text-ide-text"
            }`}
            title="Inline"
          >
            <Rows2 size={14} />
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-hidden">
        <DiffEditor
          original={original}
          modified={modified}
          language={detectedLanguage}
          theme={editorTheme}
          keepCurrentOriginalModel={true}
          keepCurrentModifiedModel={true}
          originalModelPath={`${modelIdRef.current}-original`}
          modifiedModelPath={`${modelIdRef.current}-modified`}
          onMount={(editor) => {
            editorRef.current = editor;
            const modifiedEditor = editor.getModifiedEditor();
            modifiedEditor.onDidChangeCursorSelection((e) => {
              setHasSelection(!e.selection.isEmpty());
            });
          }}
          options={{
            readOnly: !allowPartialStaging,
            renderSideBySide,
            originalEditable: false,
            minimap: { enabled: false },
            scrollBeyondLastLine: false,
            fontSize: 13,
            lineNumbers: "on",
            wordWrap: "on",
            automaticLayout: true,
            renderOverviewRuler: false,
            diffWordWrap: "on",
            ignoreTrimWhitespace: false,
            renderIndicators: true,
            renderLineHighlight: "none",
            scrollbar: {
              verticalScrollbarSize: 8,
              horizontalScrollbarSize: 8,
            },
          }}
        />
      </div>
    </div>
  );
};

export default DiffView;
