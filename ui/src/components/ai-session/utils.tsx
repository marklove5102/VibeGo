import React from "react";
import type { AIProviderId, AISessionMeta } from "@/types/ai-session";

export const providerOrder: AIProviderId[] = ["claude", "codex", "gemini", "opencode", "openclaw"];

export const providerLabels: Record<AIProviderId, string> = {
  claude: "Claude Code",
  codex: "Codex",
  gemini: "Gemini CLI",
  opencode: "OpenCode",
  openclaw: "OpenClaw",
};

export function formatCount(template: string, count: number) {
  return template.replace("{count}", String(count));
}

export function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function renderHighlightedText(content: string, query: string) {
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

export function roleTone(role: string) {
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

export function roleLabelTone(role: string) {
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

export function roleLabel(role: string, t: (key: string) => string) {
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

export function formatRelativeTime(value: number | undefined, locale: "en" | "zh", t: (key: string) => string) {
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
  return new Date(value).toLocaleDateString(locale === "zh" ? "zh-CN" : "en-US");
}

export function formatDateTime(value: number | undefined, locale: "en" | "zh") {
  if (!value) {
    return "";
  }
  return new Date(value).toLocaleString(locale === "zh" ? "zh-CN" : "en-US");
}

export function buildSessionSearchText(session: AISessionMeta) {
  return [session.sessionId, session.title, session.summary, session.projectDir, session.sourcePath]
    .filter(Boolean)
    .join(" ");
}
