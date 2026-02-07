import { Bot, ChevronRight, Database, RefreshCw } from "lucide-react";
import React from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useAISessionOverview } from "@/hooks/use-ai-session";
import { type Locale, useTranslation } from "@/lib/i18n";

interface AiSessionEntryProps {
  locale: Locale;
  onOpen: () => void;
}

const AiSessionEntry: React.FC<AiSessionEntryProps> = ({ locale, onOpen }) => {
  const t = useTranslation(locale);
  const overviewQuery = useAISessionOverview();
  const overview = overviewQuery.data;

  return (
    <Card className="border-ide-border bg-gradient-to-br from-ide-panel via-ide-panel to-ide-bg py-0 shadow-sm">
      <CardContent className="px-4 py-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-sm font-semibold text-ide-text">
              <div className="flex size-10 items-center justify-center rounded-2xl border border-ide-border bg-ide-bg text-ide-accent">
                <Bot size={18} />
              </div>
              <div>
                <div>{t("home.aiSessionsTitle")}</div>
                <div className="mt-1 text-xs font-normal text-ide-mute">{t("home.aiSessionsDescription")}</div>
              </div>
            </div>
          </div>
          <Button variant="outline" size="sm" className="shrink-0 gap-1.5" onClick={onOpen}>
            {t("home.aiSessionsOpen")}
            <ChevronRight size={14} />
          </Button>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <div className="rounded-2xl border border-ide-border bg-ide-bg px-3 py-2">
            <div className="text-[11px] uppercase tracking-wide text-ide-mute">{t("home.aiSessionsIndexed")}</div>
            <div className="mt-1 text-lg font-semibold text-ide-text">
              {overviewQuery.isLoading ? "..." : overview?.totalSessions || 0}
            </div>
          </div>
          <div className="rounded-2xl border border-ide-border bg-ide-bg px-3 py-2">
            <div className="text-[11px] uppercase tracking-wide text-ide-mute">{t("home.aiSessionsProviders")}</div>
            <div className="mt-1 text-lg font-semibold text-ide-text">
              {overviewQuery.isLoading ? "..." : overview?.enabledProviders || 0}
            </div>
          </div>
          <div className="rounded-2xl border border-ide-border bg-ide-bg px-3 py-2">
            <div className="text-[11px] uppercase tracking-wide text-ide-mute">{t("home.aiSessionsSource")}</div>
            <div className="mt-1 flex items-center gap-1 text-sm font-medium text-ide-text">
              <Database size={14} className="text-ide-accent" />
              {overview?.fromCache ? t("home.aiSessionsCached") : t("home.aiSessionsPending")}
            </div>
          </div>
          <div className="rounded-2xl border border-ide-border bg-ide-bg px-3 py-2">
            <div className="text-[11px] uppercase tracking-wide text-ide-mute">{t("home.aiSessionsState")}</div>
            <div className="mt-1 flex items-center gap-1 text-sm font-medium text-ide-text">
              <RefreshCw size={14} className={overviewQuery.isFetching ? "animate-spin text-ide-accent" : "text-ide-accent"} />
              {overviewQuery.isError ? t("home.aiSessionsError") : t("home.aiSessionsReady")}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default AiSessionEntry;
