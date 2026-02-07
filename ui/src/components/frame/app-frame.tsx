import React from "react";
import { useFrameStore } from "@/stores/frame-store";
import BottomBar from "./bottom-bar";
import TabBar from "./tab-bar";
import TopBar from "./top-bar";

interface AppFrameProps {
  children: React.ReactNode;
  onMenuOpen?: () => void;
  onTabAction?: () => void;
  onBackToList?: () => void;
  onNewPage?: () => void;
}

const AppFrame: React.FC<AppFrameProps> = ({ children, onMenuOpen, onTabAction, onBackToList, onNewPage }) => {
  const topBarConfig = useFrameStore((s) => s.topBarConfig);

  return (
    <div className="h-dvh min-h-dvh flex flex-col bg-ide-bg text-ide-text overflow-hidden font-mono transition-colors duration-300">
      {topBarConfig.show ? <TopBar /> : <TabBar onAction={onTabAction} onBackToList={onBackToList} />}
      <main className="flex-1 overflow-hidden relative">{children}</main>
      <BottomBar onMenuClick={onMenuOpen} onNewPage={onNewPage} />
    </div>
  );
};

export default AppFrame;
