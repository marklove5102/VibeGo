import { DiffEditor } from "@monaco-editor/react";
import { AlertTriangle, Check, X } from "lucide-react";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { fileApi } from "@/api/file";
import type { Locale } from "@/stores";
import "@/lib/monaco";
import { useAppStore } from "@/stores/app-store";

interface ConflictViewProps {
  repoPath: string;
  filePath: string;
  locale: Locale;
  onResolve: (content: string) => void;
  onCancel: () => void;
}

const i18n = {
  en: {
    title: "Resolve Conflict",
    ours: "Ours (Current)",
    theirs: "Theirs (Incoming)",
    resolved: "Resolved",
    accept: "Accept Resolution",
    cancel: "Cancel",
    loading: "Loading...",
    useOurs: "Use Ours",
    useTheirs: "Use Theirs",
  },
  zh: {
    title: "解决冲突",
    ours: "我们的 (当前)",
    theirs: "他们的 (传入)",
    resolved: "已解决",
    accept: "接受解决",
    cancel: "取消",
    loading: "加载中...",
    useOurs: "使用我们的",
    useTheirs: "使用他们的",
  },
};

const parseConflictMarkers = (content: string) => {
  const lines = content.split("\n");
  let ours = "";
  let theirs = "";
  let base = "";
  let inOurs = false;
  let inTheirs = false;
  let inBase = false;

  for (const line of lines) {
    if (line.startsWith("<<<<<<<")) {
      inOurs = true;
      continue;
    }
    if (line.startsWith("|||||||")) {
      inOurs = false;
      inBase = true;
      continue;
    }
    if (line.startsWith("=======")) {
      inOurs = false;
      inBase = false;
      inTheirs = true;
      continue;
    }
    if (line.startsWith(">>>>>>>")) {
      inTheirs = false;
      continue;
    }

    if (inOurs) {
      ours += line + "\n";
    } else if (inBase) {
      base += line + "\n";
    } else if (inTheirs) {
      theirs += line + "\n";
    }
  }

  return { ours: ours.trimEnd(), theirs: theirs.trimEnd(), base: base.trimEnd() };
};

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
    go: "go",
    py: "python",
  };
  return langMap[ext || ""] || "plaintext";
};

const ConflictView: React.FC<ConflictViewProps> = ({
  repoPath,
  filePath,
  locale,
  onResolve,
  onCancel,
}) => {
  const t = i18n[locale] || i18n.en;
  const appTheme = useAppStore((s) => s.theme);
  const [loading, setLoading] = useState(true);
  const [ours, setOurs] = useState("");
  const [theirs, setTheirs] = useState("");
  const [resolved, setResolved] = useState("");
  const [activeTab, setActiveTab] = useState<"compare" | "edit">("compare");
  const compareModelIdRef = useRef(`git-conflict-compare-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  const editModelIdRef = useRef(`git-conflict-edit-${Date.now()}-${Math.random().toString(36).slice(2)}`);

  const editorTheme = useMemo(() => {
    return appTheme === "light" ? "light" : "vs-dark";
  }, [appTheme]);

  const language = getLanguageFromFilename(filePath);
  const filename = filePath.split("/").pop() || filePath;

  useEffect(() => {
    const loadContent = async () => {
      setLoading(true);
      try {
        const fullPath = `${repoPath}/${filePath}`;
        const res = await fileApi.read(fullPath);
        const content = res.content || "";
        const parsed = parseConflictMarkers(content);
        setOurs(parsed.ours);
        setTheirs(parsed.theirs);
        setResolved(parsed.ours);
      } catch (err) {
        console.error("Failed to load conflict file:", err);
      } finally {
        setLoading(false);
      }
    };
    loadContent();
  }, [repoPath, filePath]);

  const handleUseOurs = () => {
    setResolved(ours);
    setActiveTab("edit");
  };

  const handleUseTheirs = () => {
    setResolved(theirs);
    setActiveTab("edit");
  };

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center text-ide-mute">
        {t.loading}
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-ide-bg">
      <div className="flex items-center justify-between px-3 py-2 border-b border-ide-border bg-ide-panel/50">
        <div className="flex items-center gap-2">
          <AlertTriangle size={16} className="text-yellow-500" />
          <span className="text-sm font-medium text-ide-text">{filename}</span>
          <span className="text-xs text-ide-mute">{t.title}</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleUseOurs}
            className="px-2 py-1 text-xs bg-blue-500/20 text-blue-400 rounded hover:bg-blue-500/30"
          >
            {t.useOurs}
          </button>
          <button
            onClick={handleUseTheirs}
            className="px-2 py-1 text-xs bg-green-500/20 text-green-400 rounded hover:bg-green-500/30"
          >
            {t.useTheirs}
          </button>
        </div>
      </div>

      <div className="flex border-b border-ide-border">
        <button
          onClick={() => setActiveTab("compare")}
          className={`px-4 py-2 text-xs font-medium transition-colors ${
            activeTab === "compare"
              ? "text-ide-accent border-b-2 border-ide-accent"
              : "text-ide-mute hover:text-ide-text"
          }`}
        >
          {t.ours} vs {t.theirs}
        </button>
        <button
          onClick={() => setActiveTab("edit")}
          className={`px-4 py-2 text-xs font-medium transition-colors ${
            activeTab === "edit"
              ? "text-ide-accent border-b-2 border-ide-accent"
              : "text-ide-mute hover:text-ide-text"
          }`}
        >
          {t.resolved}
        </button>
      </div>

      <div className="flex-1 overflow-hidden">
        {activeTab === "compare" ? (
          <DiffEditor
            original={ours}
            modified={theirs}
            language={language}
            theme={editorTheme}
            keepCurrentOriginalModel={true}
            keepCurrentModifiedModel={true}
            originalModelPath={`${compareModelIdRef.current}-original`}
            modifiedModelPath={`${compareModelIdRef.current}-modified`}
            options={{
              readOnly: true,
              renderSideBySide: true,
              minimap: { enabled: false },
              scrollBeyondLastLine: false,
              fontSize: 13,
              automaticLayout: true,
            }}
          />
        ) : (
          <DiffEditor
            original={ours}
            modified={resolved}
            language={language}
            theme={editorTheme}
            keepCurrentOriginalModel={true}
            keepCurrentModifiedModel={true}
            originalModelPath={`${editModelIdRef.current}-original`}
            modifiedModelPath={`${editModelIdRef.current}-modified`}
            onMount={(editor) => {
              const modifiedEditor = editor.getModifiedEditor();
              modifiedEditor.onDidChangeModelContent(() => {
                setResolved(modifiedEditor.getValue());
              });
            }}
            options={{
              readOnly: false,
              originalEditable: false,
              renderSideBySide: true,
              minimap: { enabled: false },
              scrollBeyondLastLine: false,
              fontSize: 13,
              automaticLayout: true,
            }}
          />
        )}
      </div>

      <div className="flex items-center justify-end gap-2 px-3 py-2 border-t border-ide-border bg-ide-panel/30">
        <button
          onClick={onCancel}
          className="px-4 py-1.5 text-sm text-ide-mute hover:text-ide-text flex items-center gap-1"
        >
          <X size={14} />
          {t.cancel}
        </button>
        <button
          onClick={() => onResolve(resolved)}
          className="px-4 py-1.5 text-sm bg-ide-accent text-ide-bg rounded flex items-center gap-1 hover:bg-ide-accent/80"
        >
          <Check size={14} />
          {t.accept}
        </button>
      </div>
    </div>
  );
};

export default ConflictView;
