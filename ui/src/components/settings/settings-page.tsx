import { AlignLeft, Bell, Clock, Eye, EyeOff, Grid, List, Mail, Settings, User, WrapText, X } from "lucide-react";
import React, { useEffect, useState } from "react";
import { useFrameController } from "@/framework/frame/controller";
import { type Locale, useTranslation } from "@/lib/i18n";
import { getSettingsByCategory, SETTING_CATEGORIES, type SettingSchema, useSettingsStore } from "@/lib/settings";
import { requestTerminalNotificationPermission } from "@/services/terminal-notification-service";
import { useFrameStore } from "@/stores/frame-store";

const SettingItem: React.FC<{
  schema: SettingSchema;
  value: string;
  onChange: (value: string) => void;
  t: (key: string) => string;
}> = ({ schema, value, onChange, t }) => {
  const getIcon = () => {
    switch (schema.key) {
      case "showHiddenFiles":
        return value === "true" ? <Eye size={18} /> : <EyeOff size={18} />;
      case "defaultViewMode":
        return value === "list" ? <List size={18} /> : <Grid size={18} />;
      case "editorWordWrap":
        return value === "true" ? <WrapText size={18} /> : <AlignLeft size={18} />;
      case "terminalDesktopNotifications":
        return <Bell size={18} />;
      case "gitUserName":
        return <User size={18} />;
      case "gitUserEmail":
        return <Mail size={18} />;
      case "gitDefaultCommitMessage":
        return <AlignLeft size={18} />;
      case "gitCommitTimeMode":
        return <Clock size={18} />;
      default:
        return <Settings size={18} />;
    }
  };

  if (schema.type === "toggle") {
    const enabled = value === "true";

    return (
      <div className="flex items-center justify-between gap-4 p-4 bg-ide-bg rounded-lg border border-ide-border">
        <div className="flex items-center gap-3 min-w-0">
          <div className={`shrink-0 transition-colors ${enabled ? "text-ide-accent" : "text-ide-mute"}`}>
            {getIcon()}
          </div>
          <div className="min-w-0">
            <div className="text-sm font-medium text-ide-text">{t(schema.labelKey)}</div>
            {schema.descriptionKey && <div className="text-xs leading-5 text-ide-mute">{t(schema.descriptionKey)}</div>}
          </div>
        </div>
        <button
          type="button"
          aria-pressed={enabled}
          onClick={() => onChange(enabled ? "false" : "true")}
          className={`relative inline-flex h-7 w-12 shrink-0 rounded-full border transition-colors duration-200 focus:outline-none focus:border-ide-accent ${enabled ? "border-ide-accent bg-ide-accent/12" : "border-ide-border bg-ide-panel hover:border-ide-mute/40"}`}
        >
          <span
            className={`absolute left-0.5 top-1/2 h-5 w-5 -translate-y-1/2 rounded-full border shadow-sm transition-all duration-200 ${enabled ? "translate-x-5 border-ide-accent bg-ide-accent" : "translate-x-0 border-ide-border bg-white"}`}
          />
        </button>
      </div>
    );
  }

  if (schema.type === "select" && schema.options) {
    return (
      <div className="p-4 bg-ide-bg rounded-lg border border-ide-border">
        <div className="flex items-center gap-3 mb-3">
          <div className="text-ide-mute">{getIcon()}</div>
          <div>
            <div className="text-sm font-medium text-ide-text">{t(schema.labelKey)}</div>
            {schema.descriptionKey && <div className="text-xs text-ide-mute">{t(schema.descriptionKey)}</div>}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {schema.options.map((opt) => {
            const label = opt.label.startsWith("settings.") ? t(opt.label) : opt.label;
            return (
              <button
                key={opt.value}
                onClick={() => onChange(opt.value)}
                className={`px-3 py-1.5 text-xs rounded-md border transition-all ${
                  value === opt.value
                    ? "bg-ide-accent text-ide-bg border-ide-accent"
                    : "bg-ide-panel text-ide-text border-ide-border hover:border-ide-accent"
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  if (schema.type === "number") {
    return (
      <div className="flex items-center justify-between p-4 bg-ide-bg rounded-lg border border-ide-border">
        <div className="flex items-center gap-3">
          <div className="text-ide-mute">{getIcon()}</div>
          <div>
            <div className="text-sm font-medium text-ide-text">{t(schema.labelKey)}</div>
            {schema.descriptionKey && <div className="text-xs text-ide-mute">{t(schema.descriptionKey)}</div>}
          </div>
        </div>
        <input
          type="number"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          min={schema.min}
          max={schema.max}
          className="w-20 px-2 py-1 text-sm bg-ide-panel border border-ide-border rounded text-ide-text text-center"
        />
      </div>
    );
  }

  if (schema.type === "text") {
    return (
      <div className="p-4 bg-ide-bg rounded-lg border border-ide-border">
        <div className="flex items-center gap-3 mb-3">
          <div className="text-ide-mute">{getIcon()}</div>
          <div>
            <div className="text-sm font-medium text-ide-text">{t(schema.labelKey)}</div>
            {schema.descriptionKey && <div className="text-xs text-ide-mute">{t(schema.descriptionKey)}</div>}
          </div>
        </div>
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={t(schema.labelKey)}
          className="w-full px-3 py-1.5 text-sm bg-ide-panel border border-ide-border rounded text-ide-text placeholder:text-ide-mute"
        />
      </div>
    );
  }

  return null;
};

const SettingsPage: React.FC = () => {
  const { settings, init, set, loading } = useSettingsStore();
  const locale = (settings.locale || "zh") as Locale;
  const t = useTranslation(locale);
  const { setTopBarConfig } = useFrameController();
  const removeGroup = useFrameStore((s) => s.removeGroup);
  const hiddenKeys = new Set(["theme", "locale"]);
  const [activeTab, setActiveTab] = useState(SETTING_CATEGORIES[0].key);

  const handleSettingChange = (key: string, value: string) => {
    if (key === "terminalDesktopNotifications" && value === "true") {
      void requestTerminalNotificationPermission();
    }
    void set(key, value);
  };

  useEffect(() => {
    init();
  }, [init]);

  useEffect(() => {
    setTopBarConfig({
      show: true,
      leftButtons: [{ icon: <Settings size={18} />, active: true }],
      centerContent: (
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar touch-pan-x h-full">
          {SETTING_CATEGORIES.map((cat) => (
            <div
              key={cat.key}
              onClick={() => setActiveTab(cat.key)}
              className={`shrink-0 px-2 h-7 rounded-md flex items-center gap-1 text-xs border transition-all cursor-pointer ${
                activeTab === cat.key
                  ? "bg-ide-panel border-ide-accent text-ide-accent border-b-2 shadow-sm"
                  : "bg-transparent border-transparent text-ide-mute hover:bg-ide-panel hover:text-ide-text"
              }`}
            >
              <span className="font-medium">{t(cat.labelKey)}</span>
            </div>
          ))}
        </div>
      ),
      rightButtons: [
        {
          icon: <X size={18} />,
          onClick: () => removeGroup("settings"),
        },
      ],
    });
    return () => setTopBarConfig({ show: false });
  }, [t, setTopBarConfig, removeGroup, activeTab]);

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-ide-mute">{t("common.loading")}</div>
      </div>
    );
  }

  const categorySettings = getSettingsByCategory(activeTab).filter((schema) => !hiddenKeys.has(schema.key));

  return (
    <div className="h-full overflow-y-auto bg-ide-bg">
      <div className="max-w-2xl mx-auto p-4">
        <div className="space-y-2">
          {categorySettings.map((schema) => (
            <SettingItem
              key={schema.key}
              schema={schema}
              value={settings[schema.key] || schema.defaultValue}
              onChange={(v) => handleSettingChange(schema.key, v)}
              t={t}
            />
          ))}
        </div>
      </div>
    </div>
  );
};

export default SettingsPage;
