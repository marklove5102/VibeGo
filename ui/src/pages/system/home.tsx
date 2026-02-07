import { Home } from "lucide-react";
import React from "react";
import { HomePage } from "@/components/home";
import { useTranslation } from "@/lib/i18n";
import { useAppStore } from "@/stores/app-store";
import { useFrameStore } from "@/stores/frame-store";
import { registerPage } from "../registry";
import type { PageViewProps } from "../types";

const HomeView: React.FC<PageViewProps> = () => {
  const locale = useAppStore((s) => s.locale);
  const t = useTranslation(locale);
  const addToolGroup = useFrameStore((s) => s.addToolGroup);

  return (
    <HomePage
      locale={locale}
      onOpenFolder={() => {}}
      onOpenAISessions={() => addToolGroup("ai-session-manager", t("plugin.aiSessionManager.name"))}
    />
  );
};

registerPage({
  id: "home",
  name: "Home",
  nameKey: "common.home",
  icon: Home,
  category: "system",
  order: 0,
  View: HomeView,
});

export default HomeView;
