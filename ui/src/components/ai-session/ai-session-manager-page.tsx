import {
  ChevronLeft,
  Clock3,
  Database,
  Folder,
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
import { usePageTopBar } from "@/hooks/use-page-top-bar";
import { useIsMobile } from "@/hooks/use-mobile";
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
    return "border-sky-400/30 bg-sky-500/10";
  }
  if (normalized === "user") {
    return "border-emerald-400/30 bg-emerald-500/10";
  }
  if (normalized === "tool") {
    return "border-amber-400/30 bg-amber-500/10";
  }
  return "border-ide-border bg-ide-panel/70";
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
      const haystack = [
        session.sessionId,
        session.title,
        session.summary,
        session.projectDir,
        session.sourcePath,
      ]
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
            view === "settings"
              ? t("plugin.aiSessionManager.backToSessions")
              : t("plugin.aiSessionManager.settings"),
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
    <div className="h-full min-h-0 border-r border-ide-border/70 bg-ide-panel/30">
      <div className="border-b border-ide-border/70 px-4 py-3">
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="rounded-xl border border-ide-border bg-ide-bg px-3 py-2">
            <div className="text-ide-mute">{t("plugin.aiSessionManager.totalSessions")}</div>
            <div className="mt-1 text-lg font-semibold text-ide-text">{filteredSessions.length}</div>
          </div>
          <div className="rounded-xl border border-ide-border bg-ide-bg px-3 py-2">
            <div className="text-ide-mute">{t("plugin.aiSessionManager.sourceMode")}</div>
            <div className="mt-1 flex items-center gap-2 text-sm font-medium text-ide-text">
              <Database size={14} className="text-ide-accent" />
              <span>{response?.fromCache ? t("plugin.aiSessionManager.cached") : t("plugin.aiSessionManager.live")}</span>
            </div>
          </div>
        </div>
        <div className="relative mt-3">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-ide-mute" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("plugin.aiSessionManager.searchPlaceholder")}
            className="h-10 w-full rounded-xl border border-ide-border bg-ide-bg pl-9 pr-3 text-sm text-ide-text placeholder:text-ide-mute outline-none transition-colors focus:border-ide-accent"
          />
        </div>
        <div className="mt-3 flex gap-2 overflow-x-auto no-scrollbar">
          <button
            type="button"
            onClick={() => setProviderFilter("all")}
            className={cn(
              "shrink-0 rounded-full border px-3 py-1.5 text-xs transition-colors",
              providerFilter === "all"
                ? "border-ide-accent bg-ide-accent text-ide-bg"
                : "border-ide-border bg-ide-bg text-ide-mute"
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
                "shrink-0 rounded-full border px-3 py-1.5 text-xs transition-colors",
                providerFilter === providerId
                  ? "border-ide-accent bg-ide-accent text-ide-bg"
                  : "border-ide-border bg-ide-bg text-ide-mute"
              )}
            >
              {providerLabels[providerId]}
            </button>
          ))}
        </div>
      </div>
      <div className="h-[calc(100%-170px)] overflow-y-auto">
        {loading ? (
          <div className="flex h-full items-center justify-center text-sm text-ide-mute">{t("common.loading")}</div>
        ) : error ? (
          <div className="m-4 rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-400">
            {error}
          </div>
        ) : filteredSessions.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center px-6 text-center text-ide-mute">
            <History size={30} className="mb-3 opacity-60" />
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
                    "w-full rounded-2xl border p-3 text-left transition-colors",
                    active
                      ? "border-ide-accent bg-ide-accent/10"
                      : "border-ide-border bg-ide-bg hover:border-ide-accent/50"
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="rounded-full border border-ide-border px-2 py-0.5 text-[11px] text-ide-mute">
                          {providerLabels[session.providerId as AIProviderId] || session.providerId}
                        </span>
                        {session.parseError ? (
                          <span className="rounded-full bg-red-500/10 px-2 py-0.5 text-[11px] text-red-400">
                            {t("plugin.aiSessionManager.parseError")}
                          </span>
                        ) : null}
                      </div>
                      <div className="mt-2 truncate text-sm font-semibold text-ide-text">
                        {session.title || session.sessionId}
                      </div>
                    </div>
                    <div className="text-[11px] text-ide-mute">
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
    <div className={cn("space-y-2", compact ? "p-4" : "border-l border-ide-border/70 p-4")}>
      <div className="flex items-center gap-2 text-sm font-medium text-ide-text">
        <ListTree size={16} />
        <span>{t("plugin.aiSessionManager.outline")}</span>
      </div>
      <div className="space-y-2">
        {outlineItems.length === 0 ? (
          <div className="rounded-xl border border-ide-border bg-ide-bg px-3 py-4 text-xs text-ide-mute">
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
              className="w-full rounded-xl border border-ide-border bg-ide-bg px-3 py-2 text-left text-xs text-ide-mute transition-colors hover:border-ide-accent/50 hover:text-ide-text"
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
        <div className="border-b border-ide-border/70 px-4 py-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-lg font-semibold text-ide-text">{selectedSession.title || selectedSession.sessionId}</div>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-ide-mute">
                <span className="rounded-full border border-ide-border px-2 py-0.5">
                  {providerLabels[selectedSession.providerId as AIProviderId] || selectedSession.providerId}
                </span>
                {selectedSession.projectDir ? (
                  <span className="rounded-full border border-ide-border px-2 py-0.5">{selectedSession.projectDir}</span>
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
                className="rounded-full border border-ide-border bg-ide-panel px-3 py-1.5 text-xs text-ide-text"
              >
                {t("plugin.aiSessionManager.outline")}
              </button>
            ) : null}
          </div>
          {selectedSession.parseError ? (
            <div className="mt-3 rounded-2xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">
              {selectedSession.parseError}
            </div>
          ) : null}
          <div className="relative mt-4">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-ide-mute" />
            <input
              value={detailSearch}
              onChange={(event) => setDetailSearch(event.target.value)}
              placeholder={t("plugin.aiSessionManager.searchInSession")}
              className="h-10 w-full rounded-xl border border-ide-border bg-ide-panel pl-9 pr-3 text-sm text-ide-text placeholder:text-ide-mute outline-none transition-colors focus:border-ide-accent"
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
              <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-400">{detailError}</div>
            ) : messages.length === 0 ? (
              <div className="flex h-full items-center justify-center text-sm text-ide-mute">
                {t("plugin.aiSessionManager.emptyMessages")}
              </div>
            ) : (
              <div className="space-y-3">
                {messages.map((message, index) => (
                  <div
                    key={`${message.role}-${index}`}
                    id={`ai-session-message-${index}`}
                    className={cn("rounded-2xl border px-3 py-3", roleTone(message.role))}
                  >
                    <div className="mb-2 flex items-center justify-between gap-2 text-xs">
                      <span className="font-medium text-ide-text">{roleLabel(message.role, t)}</span>
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
          <SheetContent side="bottom" className="max-h-[70vh] rounded-t-3xl border-ide-border bg-ide-panel p-0">
            <SheetHeader className="border-b border-ide-border/70">
              <SheetTitle>{t("plugin.aiSessionManager.outline")}</SheetTitle>
            </SheetHeader>
            <div className="overflow-y-auto">{renderOutline(true)}</div>
          </SheetContent>
        </Sheet>
      </div>
    );
  };

  const renderSettings = () => (
    <div className="h-full overflow-y-auto bg-ide-bg">
      <div className="mx-auto max-w-3xl space-y-4 px-4 py-4">
        <div className="grid gap-3 md:grid-cols-3">
          {[
            ["autoRescanOnOpen", "plugin.aiSessionManager.autoRescanOnOpen"],
            ["cacheEnabled", "plugin.aiSessionManager.cacheEnabled"],
            ["showParseErrors", "plugin.aiSessionManager.showParseErrors"],
          ].map(([key, label]) => {
            const checked = configDraft[key as keyof AISessionConfig] as boolean;
            return (
              <button
                key={key}
                type="button"
                onClick={() =>
                  setConfigDraft((current) => ({
                    ...current,
                    [key]: !checked,
                  }))
                }
                className={cn(
                  "rounded-2xl border px-4 py-4 text-left transition-colors",
                  checked ? "border-ide-accent bg-ide-accent/10" : "border-ide-border bg-ide-panel"
                )}
              >
                <div className="text-sm font-medium text-ide-text">{t(label)}</div>
                <div className="mt-2 text-xs text-ide-mute">
                  {checked ? t("plugin.aiSessionManager.enabled") : t("plugin.aiSessionManager.disabled")}
                </div>
              </button>
            );
          })}
        </div>
        <div className="space-y-3">
          {providerOrder.map((providerId) => {
            const providerConfig = configDraft.providers[providerId] || { enabled: true, paths: [] };
            const status = providerLookup.get(providerId);
            return (
              <div key={providerId} className="rounded-3xl border border-ide-border bg-ide-panel/40 p-4">
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <div className="text-sm font-semibold text-ide-text">{providerLabels[providerId]}</div>
                      <span
                        className={cn(
                          "rounded-full px-2 py-0.5 text-[11px]",
                          providerConfig.enabled ? "bg-emerald-500/15 text-emerald-400" : "bg-ide-bg text-ide-mute"
                        )}
                      >
                        {providerConfig.enabled ? t("plugin.aiSessionManager.enabled") : t("plugin.aiSessionManager.disabled")}
                      </span>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2 text-xs text-ide-mute">
                      <span>{formatCount(t("plugin.aiSessionManager.sessionCount"), status?.sessionCount || 0)}</span>
                      <span>{formatCount(t("plugin.aiSessionManager.errorCount"), status?.errorCount || 0)}</span>
                      <span>
                        {status?.available ? t("plugin.aiSessionManager.pathAvailable") : t("plugin.aiSessionManager.pathUnavailable")}
                      </span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      updateProviderConfig(providerId, (current) => ({
                        ...current,
                        enabled: !current.enabled,
                      }))
                    }
                    className={cn(
                      "rounded-full border px-3 py-1.5 text-xs transition-colors",
                      providerConfig.enabled
                        ? "border-ide-accent bg-ide-accent text-ide-bg"
                        : "border-ide-border bg-ide-bg text-ide-mute"
                    )}
                  >
                    {providerConfig.enabled ? t("plugin.aiSessionManager.disableProvider") : t("plugin.aiSessionManager.enableProvider")}
                  </button>
                </div>
                <div className="mt-4 space-y-2">
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
                        className="h-10 flex-1 rounded-xl border border-ide-border bg-ide-bg px-3 text-sm text-ide-text placeholder:text-ide-mute outline-none transition-colors focus:border-ide-accent"
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
                          className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 text-xs text-red-400"
                        >
                          {t("common.delete")}
                        </button>
                      ) : null}
                    </div>
                  ))}
                  <div className="flex flex-wrap items-center gap-3 text-xs text-ide-mute">
                    <button
                      type="button"
                      onClick={() =>
                        updateProviderConfig(providerId, (current) => ({
                          ...current,
                          paths: [...current.paths, ""],
                        }))
                      }
                      className="rounded-full border border-ide-border bg-ide-bg px-3 py-1.5 text-ide-text"
                    >
                      {t("plugin.aiSessionManager.addPath")}
                    </button>
                    <span>{t("plugin.aiSessionManager.currentResolvedPath")}</span>
                    <span className="truncate text-ide-text">{status?.paths?.[0] || "-"}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        <div className="sticky bottom-0 flex items-center justify-end gap-2 border-t border-ide-border/70 bg-ide-bg/95 py-4 backdrop-blur">
          <button
            type="button"
            onClick={() => {
              setConfigDraft(config);
              setView("list");
            }}
            className="rounded-xl border border-ide-border bg-ide-panel px-4 py-2 text-sm text-ide-text"
          >
            {t("common.cancel")}
          </button>
          <button
            type="button"
            onClick={() => void saveConfig()}
            disabled={savingConfig}
            className="rounded-xl border border-ide-accent bg-ide-accent px-4 py-2 text-sm font-medium text-ide-bg disabled:opacity-60"
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
    <div className="grid h-full min-h-0 grid-cols-[minmax(300px,360px)_1fr]">
      {renderList()}
      {view === "settings" ? renderSettings() : renderDetail()}
    </div>
  );
};

export default AISessionManagerPage;
