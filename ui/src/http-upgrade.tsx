import { ArrowRight } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource-variable/jetbrains-mono";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import "@/index.css";
import { getTranslation, type Locale } from "@/lib/i18n";

const REDIRECT_DELAY_SECONDS = 7;
const DISABLE_FLAG = "--no-tls";

function detectLocale(): Locale {
  const params = new URLSearchParams(window.location.search);
  const requested = params.get("locale");
  if (requested === "zh" || requested === "en") {
    return requested;
  }

  const languages = navigator.languages?.length ? navigator.languages : [navigator.language];
  return languages.some((language) => language.toLowerCase().startsWith("zh")) ? "zh" : "en";
}

function buildRedirectTarget(): string {
  const current = new URL(window.location.href);
  if (current.protocol === "https:") {
    current.pathname = "/";
    current.search = "";
    current.hash = "";
    return current.toString();
  }

  current.protocol = "https:";
  return current.toString();
}

function formatTemplate(template: string, values: Record<string, string | number>): string {
  return Object.entries(values).reduce(
    (result, [key, value]) => result.replaceAll(`{${key}}`, String(value)),
    template
  );
}

function HttpUpgradePage() {
  const [locale] = useState<Locale>(detectLocale);
  const [secondsRemaining, setSecondsRemaining] = useState(REDIRECT_DELAY_SECONDS);
  const redirectTarget = useMemo(buildRedirectTarget, []);

  const t = (key: string) => getTranslation(locale, key);

  useEffect(() => {
    document.documentElement.lang = locale === "zh" ? "zh-CN" : "en";
    document.title = t("httpUpgrade.title");
  }, [locale, t]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setSecondsRemaining((current) => {
        if (current <= 1) {
          window.clearInterval(timer);
          window.location.replace(redirectTarget);
          return 0;
        }
        return current - 1;
      });
    }, 1000);

    return () => window.clearInterval(timer);
  }, [redirectTarget]);

  return (
    <div className="min-h-dvh bg-ide-bg text-ide-text">
      <div className="mx-auto flex min-h-dvh w-full max-w-4xl items-center justify-center px-3 py-3 sm:px-6 sm:py-6">
        <Card className="w-full max-w-2xl border-ide-border bg-ide-panel py-0 shadow-none">
          <CardHeader className="gap-2 border-b border-ide-border px-4 py-4 sm:px-5 sm:py-5">
            <div className="text-[11px] tracking-[0.22em] text-ide-mute uppercase">VibeGo</div>
            <CardTitle className="text-lg leading-6 font-semibold text-ide-text sm:text-xl">
              {t("httpUpgrade.heading")}
            </CardTitle>
            <p className="text-xs leading-5 text-ide-mute sm:text-sm">{t("httpUpgrade.description")}</p>
          </CardHeader>

          <CardContent className="space-y-3 px-4 py-4 sm:px-5 sm:py-5">
            <div className="space-y-2 text-xs leading-5 text-ide-mute sm:text-sm">
              <p>
                <span className="text-ide-text">{t("httpUpgrade.secureContextTitle")}：</span>
                {t("httpUpgrade.secureContextDescription")}
              </p>
              <p>
                <span className="text-ide-text">{t("httpUpgrade.certificateTitle")}：</span>
                {t("httpUpgrade.certificateDescription")}
              </p>
              <p>
                <span className="text-ide-text">{t("httpUpgrade.trustTitle")}：</span>
                {t("httpUpgrade.trustDescription")}
              </p>
            </div>

            <div className="border border-ide-border bg-ide-bg px-3 py-3">
              <div className="text-[11px] tracking-[0.18em] text-ide-mute uppercase">
                {t("httpUpgrade.targetLabel")}
              </div>
              <div className="mt-1 break-all font-mono text-[11px] leading-5 text-ide-text sm:text-xs">
                {redirectTarget}
              </div>
            </div>

            <div className="text-[11px] leading-5 text-ide-mute sm:text-xs">
              {formatTemplate(t("httpUpgrade.disableHint"), { flag: DISABLE_FLAG })}
            </div>
          </CardContent>

          <CardFooter className="flex items-center justify-between gap-3 border-t border-ide-border px-4 py-4 sm:px-5 sm:py-5">
            <div className="text-xs text-ide-mute sm:text-sm">
              {formatTemplate(t("httpUpgrade.countdown"), { seconds: secondsRemaining })}
            </div>
            <Button
              asChild
              className="h-8 rounded-none bg-ide-accent px-3 text-xs text-ide-on-accent hover:opacity-90 sm:h-9 sm:px-4 sm:text-sm"
            >
              <a href={redirectTarget}>
                <span>{t("httpUpgrade.openNow")}</span>
                <ArrowRight size={14} />
              </a>
            </Button>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}

createRoot(document.getElementById("http-upgrade-root")!).render(<HttpUpgradePage />);
