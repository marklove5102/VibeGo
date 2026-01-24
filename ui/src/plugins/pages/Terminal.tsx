import { Terminal } from "lucide-react";
import type React from "react";
import TerminalPage from "@/components/TerminalPage";
import { type PluginViewProps, registerPlugin } from "../registry";

const TerminalPluginView: React.FC<PluginViewProps> = ({ context }) => {
  const groupId = context?.groupId || "default";
  return <TerminalPage groupId={groupId} />;
};

registerPlugin({
  id: "terminal",
  name: "Terminal",
  nameKey: "plugin.terminal.name",
  icon: Terminal,
  order: 1,
  view: TerminalPluginView,
});

export default TerminalPluginView;
