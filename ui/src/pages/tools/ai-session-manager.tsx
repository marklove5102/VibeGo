import { Bot } from "lucide-react";
import React from "react";
import AISessionManagerPage from "@/components/ai-session/ai-session-manager-page";
import { registerPage } from "@/pages/registry";
import type { PageViewProps } from "@/pages/types";

const AISessionManagerView: React.FC<PageViewProps> = () => {
  return <AISessionManagerPage />;
};

registerPage({
  id: "ai-session-manager",
  name: "AI Sessions",
  nameKey: "plugin.aiSessionManager.name",
  icon: Bot,
  category: "tool",
  order: 20,
  View: AISessionManagerView,
});

export default AISessionManagerView;
