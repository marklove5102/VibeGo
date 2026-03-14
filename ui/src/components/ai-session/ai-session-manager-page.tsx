import {
  AlertTriangle,
  ChevronDown,
  ChevronLeft,
  Clock3,
  Database,
  Folder,
  FolderSearch,
  History,
  ListTree,
  RefreshCw,
  Search,
  Settings2,
} from "lucide-react";
import React from "react";
import { toast } from "sonner";
import { aiSessionApi } from "@/api";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useIsMobile } from "@/hooks/use-mobile";
import { usePageTopBar } from "@/hooks/use-page-top-bar";
import { getIntlLocale, useTranslation } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/stores/app-store";
import type {
  AIListResponse,
  AIProviderConfig,
  AIProviderId,
  AIProviderStatus,
  AISessionConfig,
  AISessionMessage,
  AISessionMeta,
} from "@/types/ai-session";

type PanelView = "list" | "detail" | "settings";
type ProviderFilter = "all" | AIProviderId;

const providerOrder: AIProviderId[] = ["claude", "codex", "gemini", "opencode", "openclaw"];

const providerLabels: Record<AIProviderId, string> = {
  claude: "Claude Code",
  codex: "Codex",
  gemini: "Gemini CLI",
  opencode: "OpenCode",
  openclaw: "OpenClaw",
};

function formatCount(template: string, count: number) {
  return template.replace("{count}", String(count));
}

function formatRelativeTime(value: number | undefined, locale: "en" | "zh", t: (key: string) => string) {
  if (!value) {
    return t("plugin.aiSessionManager.unknownTime");
  }
  const diff = Date.now() - value;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (minutes <= 0) {
    return t("time.now");
  }
  if (minutes < 60) {
    return formatCount(t("time.minutesAgoShort"), minutes);
  }
  if (hours < 24) {
    return formatCount(t("time.hoursAgoShort"), hours);
  }
  if (days < 7) {
    return formatCount(t("time.daysAgoShort"), days);
  }
  return new Date(value).toLocaleDateString(getIntlLocale(locale));
}

function formatDateTime(value: number | undefined, locale: "en" | "zh") {
  if (!value) {
    return "";
  }
  return new Date(value).toLocaleString(getIntlLocale(locale));
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function renderHighlightedText(content: string, query: string) {
  const needle = query.trim();
  if (!needle) {
    return content;
  }
  const matcher = new RegExp(`(${escapeRegExp(needle)})`, "ig");
  return content.split(matcher).map((part, index) =>
    part.toLowerCase() === needle.toLowerCase() ? (
      <mark key={`${part}-${index}`} className="bg-amber-300/60 px-0.5 text-ide-text">
        {part}
      </mark>
    ) : (
      <React.Fragment key={`${part}-${index}`}>{part}</React.Fragment>
    )
  );
}

function defaultConfigValue(): AISessionConfig {
  return {
    providers: {
      claude: { enabled: true, paths: [] },
      codex: { enabled: true, paths: [] },
      gemini: { enabled: true, paths: [] },
      opencode: { enabled: true, paths: [] },
      openclaw: { enabled: true, paths: [] },
    },
    autoRescanOnOpen: true,
    cacheEnabled: true,
    showParseErrors: true,
  };
}

const DEFAULT_CONFIG = defaultConfigValue();

function roleTone(role: string) {
  const normalized = role.toLowerCase();
  if (normalized === "assistant") {
    return "border-l-2 border-l-blue-500/70 border-ide-border bg-ide-panel";
  }
  if (normalized === "user") {
    return "border-l-2 border-l-emerald-500/70 border-ide-border bg-ide-panel";
  }
  if (normalized === "tool") {
    return "border-l-2 border-l-amber-500/70 border-ide-border bg-ide-panel";
  }
  if (normalized === "system") {
    return "border-l-2 border-l-violet-500/70 border-ide-border bg-ide-panel";
  }
  return "border-l-2 border-l-ide-border border-ide-border bg-ide-panel";
}

function roleLabelTone(role: string) {
  const normalized = role.toLowerCase();
  if (normalized === "assistant") {
    return "border-blue-500/30 text-blue-500";
  }
  if (normalized === "user") {
    return "border-emerald-500/30 text-emerald-500";
  }
  if (normalized === "tool") {
    return "border-amber-500/35 text-amber-500";
  }
  if (normalized === "system") {
    return "border-violet-500/35 text-violet-500";
  }
  return "border-ide-border text-ide-mute";
}

function roleLabel(role: string, t: (key: string) => string) {
  const normalized = role.toLowerCase();
  if (normalized === "assistant") {
    return t("plugin.aiSessionManager.roleAssistant");
  }
  if (normalized === "user") {
    return t("plugin.aiSessionManager.roleUser");
  }
  if (normalized === "tool") {
    return t("plugin.aiSessionManager.roleTool");
  }
  if (normalized === "system") {
    return t("plugin.aiSessionManager.roleSystem");
  }
  return role || t("plugin.aiSessionManager.roleUnknown");
}

function useAISessionData() {
  const [loading, setLoading] = React.useState(true);
  const [refreshing, setRefreshing] = React.useState(false);
  const [error, setError] = React.useState("");
  const [response, setResponse] = React.useState<AIListResponse | null>(null);

  const load = React.useCallback(async (mode: "list" | "rescan" = "list") => {
    const setBusy = mode === "rescan" ? setRefreshing : setLoading;
    setBusy(true);
    setError("");
    try {
      const next = mode === "rescan" ? await aiSessionApi.rescan() : await aiSessionApi.list();
      setResponse(next);
      return next;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Request failed";
      setError(message);
      throw err;
    } finally {
      setBusy(false);
    }
  }, []);

  React.useEffect(() => {
    void load("list").catch(() => {});
  }, [load]);

  return {
    loading,
    refreshing,
    error,
    response,
    load,
    setResponse,
  };
}

const AISessionManagerPage: React.FC = () => {
  const locale = useAppStore((s) => s.locale);
  const t = useTranslation(locale);
  const isMobile = useIsMobile();
  const { loading, refreshing, error, response, load, setResponse } = useAISessionData();

  const sessions = response?.sessions || [];
  const providerStatus = response?.providerStatus || [];
  const config = response?.config || DEFAULT_CONFIG;

  const [providerFilter, setProviderFilter] = React.useState<ProviderFilter>("all");
  const [query, setQuery] = React.useState("");
  const [view, setView] = React.useState<PanelView>("list");
  const [selectedSourcePath, setSelectedSourcePath] = React.useState("");
  const [detailSearch, setDetailSearch] = React.useState("");
  const [messages, setMessages] = React.useState<AISessionMessage[]>([]);
  const [detailLoading, setDetailLoading] = React.useState(false);
  const [detailError, setDetailError] = React.useState("");
  const [outlineOpen, setOutlineOpen] = React.useState(false);
  const [configDraft, setConfigDraft] = React.useState<AISessionConfig>(config);
  const [savingConfig, setSavingConfig] = React.useState(false);
  const [collapsedProviders, setCollapsedProviders] = React.useState<Set<string>>(new Set());

  React.useEffect(() => {
    setConfigDraft(config);
  }, [config]);

  const filteredSessions = React.useMemo(() => {
    const needle = query.trim().toLowerCase();
    return sessions.filter((session) => {
      if (providerFilter !== "all" && session.providerId !== providerFilter) {
        return false;
      }
      if (!needle) {
        return true;
      }
      const haystack = [session.sessionId, session.title, session.summary, session.projectDir, session.sourcePath]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(needle);
    });
  }, [providerFilter, query, sessions]);

  const selectedSession =
    filteredSessions.find((item) => item.sourcePath === selectedSourcePath) ||
    sessions.find((item) => item.sourcePath === selectedSourcePath) ||
    null;

  React.useEffect(() => {
    if (selectedSession) {
      return;
    }
    if (!isMobile && filteredSessions.length > 0) {
      setSelectedSourcePath(filteredSessions[0].sourcePath);
      setView("detail");
      return;
    }
    if (filteredSessions.length === 0) {
      setSelectedSourcePath("");
      if (isMobile) {
        setView("list");
      }
    }
  }, [filteredSessions, isMobile, selectedSession]);

  React.useEffect(() => {
    if (!selectedSession) {
      setMessages([]);
      setDetailError("");
      setDetailSearch("");
      return;
    }
    setDetailLoading(true);
    setDetailError("");
    void aiSessionApi
      .messages(selectedSession.providerId, selectedSession.sourcePath)
      .then((result) => {
        setMessages(result.messages);
      })
      .catch((err) => {
        setMessages([]);
        setDetailError(err instanceof Error ? err.message : "Request failed");
      })
      .finally(() => {
        setDetailLoading(false);
      });
  }, [selectedSession]);

  const matchedMessageCount = React.useMemo(() => {
    const needle = detailSearch.trim().toLowerCase();
    if (!needle) {
      return 0;
    }
    return messages.filter((message) => message.content.toLowerCase().includes(needle)).length;
  }, [detailSearch, messages]);

  const outlineItems = React.useMemo(
    () =>
      messages
        .map((message, index) => ({ message, index }))
        .filter((item) => item.message.role.toLowerCase() === "user")
        .map((item) => ({
          index: item.index,
          content: item.message.content,
        })),
    [messages]
  );

  const providerLookup = React.useMemo(() => {
    const lookup = new Map<string, AIProviderStatus>();
    for (const item of providerStatus) {
      lookup.set(item.providerId, item);
    }
    return lookup;
  }, [providerStatus]);

  const topBarTitle =
    isMobile && view === "detail" && selectedSession
      ? selectedSession.title || selectedSession.sessionId
      : view === "settings"
        ? t("plugin.aiSessionManager.settings")
        : t("plugin.aiSessionManager.name");

  usePageTopBar(
    {
      show: true,
      leftButtons:
        isMobile && view !== "list"
          ? [
              {
                icon: <ChevronLeft size={18} />,
                title: t("common.backToList"),
                onClick: () => setView("list"),
              },
            ]
          : undefined,
      centerContent: topBarTitle,
      rightButtons: [
        {
          icon: refreshing ? <RefreshCw size={18} className="animate-spin" /> : <RefreshCw size={18} />,
          title: t("common.refresh"),
          onClick: () => {
            void load("rescan").catch(() => {
              toast.error(t("plugin.aiSessionManager.loadFailed"));
            });
          },
        },
        {
          icon: view === "settings" ? <History size={18} /> : <Settings2 size={18} />,
          title:
            view === "settings" ? t("plugin.aiSessionManager.backToSessions") : t("plugin.aiSessionManager.settings"),
          onClick: () => setView((current) => (current === "settings" ? "list" : "settings")),
        },
      ],
    },
    [isMobile, topBarTitle, refreshing, view, selectedSession, load, t]
  );

  const onSelectSession = (session: AISessionMeta) => {
    setSelectedSourcePath(session.sourcePath);
    setView("detail");
  };

  const updateProviderConfig = (providerId: AIProviderId, updater: (current: AIProviderConfig) => AIProviderConfig) => {
    setConfigDraft((current) => ({
      ...current,
      providers: {
        ...current.providers,
        [providerId]: updater(current.providers[providerId] || { enabled: true, paths: [] }),
      },
    }));
  };

  const saveConfig = async () => {
    setSavingConfig(true);
    try {
      const saved = await aiSessionApi.saveConfig(configDraft);
      const next = await aiSessionApi.rescan();
      setConfigDraft(saved);
      setResponse(next);
      setView("list");
      toast.success(t("plugin.aiSessionManager.configSaved"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("plugin.aiSessionManager.saveFailed"));
    } finally {
      setSavingConfig(false);
    }
  };

  const renderList = () => (
    <div className="flex h-full min-h-0 flex-col border-r border-ide-border bg-ide-bg">
      <div className="border-b border-ide-border px-3 py-3">
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="rounded-lg border border-ide-border bg-ide-panel px-3 py-2">
            <div className="text-ide-mute">{t("plugin.aiSessionManager.totalSessions")}</div>
            <div className="mt-1 text-base font-semibold text-ide-text">{filteredSessions.length}</div>
          </div>
          <div className="rounded-lg border border-ide-border bg-ide-panel px-3 py-2">
            <div className="text-ide-mute">{t("plugin.aiSessionManager.sourceMode")}</div>
            <div className="mt-1 flex items-center gap-1.5 text-xs font-medium text-ide-text">
              <Database size={14} className="text-ide-accent" />
              <span>
                {response?.fromCache ? t("plugin.aiSessionManager.cached") : t("plugin.aiSessionManager.live")}
              </span>
            </div>
          </div>
        </div>
        <div className="relative mt-3">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-ide-mute" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("plugin.aiSessionManager.searchPlaceholder")}
            className="h-9 w-full rounded-md border border-ide-border bg-ide-panel pl-9 pr-3 text-sm text-ide-text placeholder:text-ide-mute outline-none transition-colors focus:border-ide-accent"
          />
        </div>
        <div className="mt-3 flex gap-2 overflow-x-auto pb-0.5 custom-scrollbar">
          <button
            type="button"
            onClick={() => setProviderFilter("all")}
            className={cn(
              "shrink-0 rounded-md border px-2.5 py-1 text-xs transition-colors",
              providerFilter === "all"
                ? "border-ide-accent bg-ide-accent/10 text-ide-accent"
                : "border-ide-border bg-ide-panel text-ide-mute hover:bg-ide-bg hover:text-ide-text"
            )}
          >
            {t("plugin.aiSessionManager.allProviders")}
          </button>
          {providerOrder.map((providerId) => (
            <button
              key={providerId}
              type="button"
              onClick={() => setProviderFilter(providerId)}
              className={cn(
                "shrink-0 rounded-md border px-2.5 py-1 text-xs transition-colors",
                providerFilter === providerId
                  ? "border-ide-accent bg-ide-accent/10 text-ide-accent"
                  : "border-ide-border bg-ide-panel text-ide-mute hover:bg-ide-bg hover:text-ide-text"
              )}
            >
              {providerLabels[providerId]}
            </button>
          ))}
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex h-full items-center justify-center text-sm text-ide-mute">{t("common.loading")}</div>
        ) : error ? (
          <div className="m-3 rounded-md border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">{error}</div>
        ) : filteredSessions.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center px-6 text-center text-ide-mute">
            <History size={28} className="mb-3 opacity-60" />
            <div className="text-sm">{t("plugin.aiSessionManager.empty")}</div>
          </div>
        ) : (
          <div className="space-y-2 p-3">
            {filteredSessions.map((session) => {
              const provider = providerLookup.get(session.providerId);
              const active = session.sourcePath === selectedSourcePath && (!isMobile || view === "detail");
              return (
                <button
                  key={session.sourcePath}
                  type="button"
                  onClick={() => onSelectSession(session)}
                  className={cn(
                    "w-full rounded-lg border bg-ide-panel p-3 text-left transition-colors",
                    active
                      ? "border-ide-accent/50 bg-ide-accent/10"
                      : "border-ide-border hover:border-ide-accent/40 hover:bg-ide-bg"
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="rounded-md border border-ide-border px-1.5 py-0.5 text-[11px] text-ide-mute">
                          {providerLabels[session.providerId as AIProviderId] || session.providerId}
                        </span>
                        {session.parseError ? (
                          <span className="rounded-md border border-red-500/30 bg-red-500/10 px-1.5 py-0.5 text-[11px] text-red-400">
                            {t("plugin.aiSessionManager.parseError")}
                          </span>
                        ) : null}
                      </div>
                      <div className="mt-2 truncate text-sm font-medium text-ide-text">
                        {session.title || session.sessionId}
                      </div>
                    </div>
                    <div className="text-xs text-ide-mute">
                      {formatRelativeTime(session.lastActiveAt || session.createdAt, locale, t)}
                    </div>
                  </div>
                  <div className="mt-2 line-clamp-2 text-xs leading-5 text-ide-mute">
                    {session.summary || t("plugin.aiSessionManager.noSummary")}
                  </div>
                  <div className="mt-3 flex items-center justify-between gap-2 text-[11px] text-ide-mute">
                    <div className="flex min-w-0 items-center gap-1 truncate">
                      <Folder size={12} />
                      <span className="truncate">
                        {session.projectDir || t("plugin.aiSessionManager.unknownProject")}
                      </span>
                    </div>
                    <div className="shrink-0">
                      {provider
                        ? formatCount(t("plugin.aiSessionManager.messageCount"), session.messageCount || 0)
                        : ""}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );

  const renderOutline = (compact: boolean) => (
    <div className={cn("space-y-2 bg-ide-bg", compact ? "p-4" : "border-l border-ide-border p-4")}>
      <div className="flex items-center gap-2 text-sm font-medium text-ide-text">
        <ListTree size={16} />
        <span>{t("plugin.aiSessionManager.outline")}</span>
      </div>
      <div className="space-y-2">
        {outlineItems.length === 0 ? (
          <div className="rounded-md border border-ide-border bg-ide-panel px-3 py-4 text-xs text-ide-mute">
            {t("plugin.aiSessionManager.noOutline")}
          </div>
        ) : (
          outlineItems.map((item, index) => (
            <button
              key={`${item.index}-${index}`}
              type="button"
              onClick={() => {
                const target = document.getElementById(`ai-session-message-${item.index}`);
                target?.scrollIntoView({ behavior: "smooth", block: "center" });
                setOutlineOpen(false);
              }}
              className="w-full rounded-md border border-ide-border bg-ide-panel px-3 py-2 text-left text-xs text-ide-mute transition-colors hover:border-ide-accent/40 hover:bg-ide-bg hover:text-ide-text"
            >
              <div className="line-clamp-2">{item.content}</div>
            </button>
          ))
        )}
      </div>
    </div>
  );

  const renderDetail = () => {
    if (!selectedSession) {
      return (
        <div className="flex h-full items-center justify-center px-6 text-center text-ide-mute">
          <History size={30} className="mb-3 opacity-60" />
          <div className="text-sm">{t("plugin.aiSessionManager.selectSession")}</div>
        </div>
      );
    }
    return (
      <div className="flex h-full min-h-0 flex-col bg-ide-bg">
        <div className="border-b border-ide-border px-4 py-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-lg font-semibold text-ide-text">
                {selectedSession.title || selectedSession.sessionId}
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-ide-mute">
                <span className="rounded-md border border-ide-border bg-ide-panel px-2 py-0.5">
                  {providerLabels[selectedSession.providerId as AIProviderId] || selectedSession.providerId}
                </span>
                {selectedSession.projectDir ? (
                  <span className="rounded-md border border-ide-border bg-ide-panel px-2 py-0.5">
                    {selectedSession.projectDir}
                  </span>
                ) : null}
                <span className="inline-flex items-center gap-1">
                  <Clock3 size={12} />
                  {formatDateTime(selectedSession.lastActiveAt || selectedSession.createdAt, locale)}
                </span>
              </div>
            </div>
            {isMobile ? (
              <button
                type="button"
                onClick={() => setOutlineOpen(true)}
                className="rounded-md border border-ide-border bg-ide-panel px-3 py-1.5 text-xs text-ide-text transition-colors hover:bg-ide-bg"
              >
                {t("plugin.aiSessionManager.outline")}
              </button>
            ) : null}
          </div>
          {selectedSession.parseError ? (
            <div className="mt-3 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">
              {selectedSession.parseError}
            </div>
          ) : null}
          <div className="relative mt-4">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-ide-mute" />
            <input
              value={detailSearch}
              onChange={(event) => setDetailSearch(event.target.value)}
              placeholder={t("plugin.aiSessionManager.searchInSession")}
              className="h-9 w-full rounded-md border border-ide-border bg-ide-panel pl-9 pr-3 text-sm text-ide-text placeholder:text-ide-mute outline-none transition-colors focus:border-ide-accent"
            />
          </div>
          {detailSearch.trim() ? (
            <div className="mt-2 text-xs text-ide-mute">
              {formatCount(t("plugin.aiSessionManager.matchedMessages"), matchedMessageCount)}
            </div>
          ) : null}
        </div>
        <div className={cn("grid min-h-0 flex-1", outlineItems.length > 0 ? "xl:grid-cols-[minmax(0,1fr)_240px]" : "")}>
          <div className="min-h-0 overflow-y-auto px-4 py-4">
            {detailLoading ? (
              <div className="flex h-full items-center justify-center text-sm text-ide-mute">{t("common.loading")}</div>
            ) : detailError ? (
              <div className="rounded-md border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-400">
                {detailError}
              </div>
            ) : messages.length === 0 ? (
              <div className="flex h-full items-center justify-center text-sm text-ide-mute">
                {t("plugin.aiSessionManager.emptyMessages")}
              </div>
            ) : (
              <div className="space-y-2">
                {messages.map((message, index) => (
                  <div
                    key={`${message.role}-${index}`}
                    id={`ai-session-message-${index}`}
                    className={cn("rounded-md border px-3 py-3", roleTone(message.role))}
                  >
                    <div className="mb-2 flex items-center justify-between gap-2 text-xs">
                      <span
                        className={cn(
                          "inline-flex rounded-md border px-1.5 py-0.5 text-[11px] font-medium",
                          roleLabelTone(message.role)
                        )}
                      >
                        {roleLabel(message.role, t)}
                      </span>
                      <span className="text-ide-mute">{formatDateTime(message.ts, locale)}</span>
                    </div>
                    <div className="whitespace-pre-wrap break-words text-sm leading-6 text-ide-text">
                      {renderHighlightedText(message.content, detailSearch)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          {!isMobile && outlineItems.length > 0 ? renderOutline(false) : null}
        </div>
        <Sheet open={outlineOpen} onOpenChange={setOutlineOpen}>
          <SheetContent side="bottom" className="max-h-[70vh] rounded-t-xl border-ide-border bg-ide-bg p-0">
            <SheetHeader className="border-b border-ide-border">
              <SheetTitle>{t("plugin.aiSessionManager.outline")}</SheetTitle>
            </SheetHeader>
            <div className="overflow-y-auto">{renderOutline(true)}</div>
          </SheetContent>
        </Sheet>
      </div>
    );
  };

  const toggleCollapsed = (providerId: string) => {
    setCollapsedProviders((prev) => {
      const next = new Set(prev);
      if (next.has(providerId)) {
        next.delete(providerId);
      } else {
        next.add(providerId);
      }
      return next;
    });
  };

  const allEnabled = providerOrder.every((id) => (configDraft.providers[id] || { enabled: true }).enabled);

  const renderSettings = () => (
    <div className="flex h-full min-h-0 flex-col bg-ide-bg">
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl space-y-5 px-4 py-4">
          <div className="text-xs font-semibold uppercase tracking-wider text-ide-mute">
            {t("plugin.aiSessionManager.generalSettings")}
          </div>
          <div className="rounded-lg border border-ide-border bg-ide-panel">
            {[
              [
                "autoRescanOnOpen",
                "plugin.aiSessionManager.autoRescanOnOpen",
                "plugin.aiSessionManager.autoRescanOnOpenDesc",
              ],
              ["cacheEnabled", "plugin.aiSessionManager.cacheEnabled", "plugin.aiSessionManager.cacheEnabledDesc"],
              [
                "showParseErrors",
                "plugin.aiSessionManager.showParseErrors",
                "plugin.aiSessionManager.showParseErrorsDesc",
              ],
            ].map(([key, label, desc], index, arr) => {
              const checked = configDraft[key as keyof AISessionConfig] as boolean;
              return (
                <div
                  key={key}
                  className={cn(
                    "flex items-center justify-between gap-4 px-4 py-3",
                    index < arr.length - 1 ? "border-b border-ide-border" : ""
                  )}
                >
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-ide-text">{t(label)}</div>
                    <div className="mt-0.5 text-xs leading-5 text-ide-mute">{t(desc)}</div>
                  </div>
                  <button
                    type="button"
                    aria-pressed={checked}
                    onClick={() =>
                      setConfigDraft((current) => ({
                        ...current,
                        [key]: !checked,
                      }))
                    }
                    className={cn(
                      "relative inline-flex h-7 w-12 shrink-0 rounded-full border transition-colors duration-200 focus:outline-none focus:border-ide-accent",
                      checked
                        ? "border-ide-accent bg-ide-accent/12"
                        : "border-ide-border bg-ide-panel hover:border-ide-mute/40"
                    )}
                  >
                    <span
                      className={cn(
                        "absolute left-0.5 top-1/2 h-5 w-5 -translate-y-1/2 rounded-full border shadow-sm transition-all duration-200",
                        checked
                          ? "translate-x-5 border-ide-accent bg-ide-accent"
                          : "translate-x-0 border-ide-border bg-white"
                      )}
                    />
                  </button>
                </div>
              );
            })}
          </div>

          <div className="flex items-center justify-between">
            <div className="text-xs font-semibold uppercase tracking-wider text-ide-mute">
              {t("plugin.aiSessionManager.providerSettings")}
            </div>
            <button
              type="button"
              onClick={() => {
                const nextEnabled = !allEnabled;
                setConfigDraft((current) => {
                  const next = { ...current, providers: { ...current.providers } };
                  for (const id of providerOrder) {
                    next.providers[id] = {
                      ...(next.providers[id] || { enabled: true, paths: [] }),
                      enabled: nextEnabled,
                    };
                  }
                  return next;
                });
              }}
              className="rounded-md border border-ide-border bg-ide-panel px-2.5 py-1 text-[11px] text-ide-mute transition-colors hover:bg-ide-bg hover:text-ide-text"
            >
              {allEnabled ? t("plugin.aiSessionManager.disableAll") : t("plugin.aiSessionManager.enableAll")}
            </button>
          </div>

          <div className="space-y-3">
            {providerOrder.map((providerId) => {
              const providerConfig = configDraft.providers[providerId] || { enabled: true, paths: [] };
              const status = providerLookup.get(providerId);
              const collapsed = collapsedProviders.has(providerId);
              const hasErrors = (status?.errorCount || 0) > 0;
              return (
                <div key={providerId} className="rounded-lg border border-ide-border bg-ide-panel">
                  <button
                    type="button"
                    onClick={() => toggleCollapsed(providerId)}
                    className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="truncate text-sm font-semibold text-ide-text">{providerLabels[providerId]}</div>
                      <span
                        className={cn(
                          "shrink-0 rounded-md border px-1.5 py-0.5 text-[11px]",
                          providerConfig.enabled
                            ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-500"
                            : "border-ide-border bg-ide-bg text-ide-mute"
                        )}
                      >
                        {providerConfig.enabled
                          ? t("plugin.aiSessionManager.enabled")
                          : t("plugin.aiSessionManager.disabled")}
                      </span>
                      {hasErrors ? (
                        <span className="shrink-0 rounded-md border border-red-500/30 bg-red-500/10 px-1.5 py-0.5 text-[11px] text-red-400">
                          {formatCount(t("plugin.aiSessionManager.errorCount"), status?.errorCount || 0)}
                        </span>
                      ) : null}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-ide-mute">
                        {formatCount(t("plugin.aiSessionManager.sessionCount"), status?.sessionCount || 0)}
                      </span>
                      <ChevronDown
                        size={16}
                        className={cn("text-ide-mute transition-transform duration-200", collapsed ? "-rotate-90" : "")}
                      />
                    </div>
                  </button>

                  {!collapsed ? (
                    <>
                      <div className="border-t border-ide-border px-4 py-3">
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ide-mute">
                            <span
                              className={cn("inline-flex items-center gap-1", !status?.available ? "text-red-400" : "")}
                            >
                              {!status?.available ? <AlertTriangle size={12} /> : null}
                              {status?.available
                                ? t("plugin.aiSessionManager.pathAvailable")
                                : t("plugin.aiSessionManager.pathUnavailable")}
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              updateProviderConfig(providerId, (current) => ({
                                ...current,
                                enabled: !current.enabled,
                              }));
                            }}
                            className={cn(
                              "h-8 shrink-0 rounded-md border px-3 text-xs transition-colors",
                              providerConfig.enabled
                                ? "border-ide-accent/50 bg-ide-accent/10 text-ide-accent"
                                : "border-ide-border bg-ide-bg text-ide-mute hover:text-ide-text"
                            )}
                          >
                            {providerConfig.enabled
                              ? t("plugin.aiSessionManager.disableProvider")
                              : t("plugin.aiSessionManager.enableProvider")}
                          </button>
                        </div>
                      </div>

                      <div className="space-y-2 border-t border-ide-border px-4 py-3">
                        {(providerConfig.paths.length > 0 ? providerConfig.paths : [""]).map((path, index) => (
                          <div key={`${providerId}-${index}`} className="flex gap-2">
                            <input
                              value={path}
                              onChange={(event) =>
                                updateProviderConfig(providerId, (current) => ({
                                  ...current,
                                  paths:
                                    current.paths.length === 0
                                      ? [event.target.value]
                                      : current.paths.map((item, itemIndex) =>
                                          itemIndex === index ? event.target.value : item
                                        ),
                                }))
                              }
                              placeholder={status?.paths?.[0] || t("plugin.aiSessionManager.pathPlaceholder")}
                              className="h-9 min-w-0 flex-1 rounded-md border border-ide-border bg-ide-bg px-3 text-sm text-ide-text placeholder:text-ide-mute outline-none transition-colors focus:border-ide-accent"
                            />
                            {providerConfig.paths.length > 0 ? (
                              <button
                                type="button"
                                onClick={() =>
                                  updateProviderConfig(providerId, (current) => ({
                                    ...current,
                                    paths: current.paths.filter((_, itemIndex) => itemIndex !== index),
                                  }))
                                }
                                className="h-9 shrink-0 rounded-md border border-red-500/30 bg-red-500/10 px-3 text-xs text-red-400"
                              >
                                {t("common.delete")}
                              </button>
                            ) : null}
                          </div>
                        ))}
                        <button
                          type="button"
                          onClick={() =>
                            updateProviderConfig(providerId, (current) => ({
                              ...current,
                              paths: [...current.paths, ""],
                            }))
                          }
                          className="h-8 rounded-md border border-ide-border bg-ide-bg px-3 text-xs text-ide-text transition-colors hover:bg-ide-panel"
                        >
                          {t("plugin.aiSessionManager.addPath")}
                        </button>
                        <div className="mt-1 flex items-center gap-2 rounded-md border border-ide-border bg-ide-bg px-3 py-2 text-xs">
                          <FolderSearch size={14} className="shrink-0 text-ide-accent" />
                          <span className="text-ide-mute">{t("plugin.aiSessionManager.currentResolvedPath")}</span>
                          <span className="min-w-0 flex-1 truncate font-mono text-ide-text">
                            {status?.paths?.[0] || "-"}
                          </span>
                        </div>
                      </div>
                    </>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="border-t border-ide-border bg-ide-bg/95 px-4 py-3 shadow-[0_-4px_12px_rgba(0,0,0,0.08)] backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => {
              setConfigDraft(config);
              setView("list");
            }}
            className="h-9 rounded-md border border-ide-border bg-ide-panel px-4 text-sm text-ide-text transition-colors hover:bg-ide-bg"
          >
            {t("common.cancel")}
          </button>
          <button
            type="button"
            onClick={() => void saveConfig()}
            disabled={savingConfig}
            className="h-9 rounded-md border border-ide-accent bg-ide-accent px-4 text-sm font-medium text-ide-bg transition-colors hover:bg-ide-accent/90 disabled:opacity-60"
          >
            {savingConfig ? t("common.loading") : t("plugin.aiSessionManager.saveConfig")}
          </button>
        </div>
      </div>
    </div>
  );

  if (isMobile) {
    if (view === "settings") {
      return renderSettings();
    }
    if (view === "detail") {
      return renderDetail();
    }
    return renderList();
  }

  return (
    <div className="grid h-full min-h-0 grid-cols-[minmax(280px,340px)_1fr] bg-ide-bg">
      {renderList()}
      {view === "settings" ? renderSettings() : renderDetail()}
    </div>
  );
};

export default AISessionManagerPage;
