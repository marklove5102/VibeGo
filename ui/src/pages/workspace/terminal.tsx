import { Terminal } from "lucide-react";
import React from "react";
import { TerminalPage } from "@/components/terminal";
import { registerPage } from "../registry";
import type { PageViewProps } from "../types";

const TerminalWorkspaceView: React.FC<PageViewProps> = ({ context }) => {
  return <TerminalPage groupId={context.groupId} cwd={context.path} />;
};

registerPage({
  id: "terminal",
  name: "Terminal",
  nameKey: "plugin.terminal.name",
  icon: Terminal,
  category: "tool",
  order: 1,
  View: TerminalWorkspaceView,
});

export default TerminalWorkspaceView;
