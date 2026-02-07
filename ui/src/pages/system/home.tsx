import { Home } from "lucide-react";
import React from "react";
import { HomePage } from "@/components/home";
import { useAppStore } from "@/stores/app-store";
import { registerPage } from "../registry";
import type { PageViewProps } from "../types";

const HomeView: React.FC<PageViewProps> = () => {
  const locale = useAppStore((s) => s.locale);
  return <HomePage locale={locale} onOpenFolder={() => {}} />;
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
