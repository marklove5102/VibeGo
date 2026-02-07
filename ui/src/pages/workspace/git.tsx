import { GitGraph } from "lucide-react";
import React from "react";
import { GitView } from "@/components/git";
import { useAppStore } from "@/stores/app-store";
import { registerPage } from "../registry";
import type { PageViewProps } from "../types";

const GitViewPage: React.FC<PageViewProps> = ({ context }) => {
  const locale = useAppStore((s) => s.locale);
  const pagePath = context.path || "";
  return <GitView path={pagePath} locale={locale} isActive={true} />;
};

registerPage({
  id: "git",
  name: "Git",
  icon: GitGraph,
  category: "workspace",
  order: 20,
  View: GitViewPage,
});

export default GitViewPage;
