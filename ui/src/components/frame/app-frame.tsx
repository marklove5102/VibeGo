import React from "react";
import { useFrameStore } from "@/stores/frame-store";
import BottomBar from "./bottom-bar";
import SideBar from "./side-bar";
import TabBar from "./tab-bar";
import TopBar from "./top-bar";

interface AppFrameProps {
  children: React.ReactNode;
  onMenuOpen?: () => void;
  onRefresh?: () => void;
  onBackToList?: () => void;
  onNewPage?: () => void;
}

const AppFrame: React.FC<AppFrameProps> = ({ children, onMenuOpen, onRefresh, onBackToList, onNewPage }) => {
  const topBarConfig = useFrameStore((s) => s.topBarConfig);

  return (
    <div className="h-dvh min-h-dvh flex bg-ide-bg text-ide-text overflow-hidden font-mono transition-colors duration-300">
      <SideBar onMenuClick={onMenuOpen} onNewPage={onNewPage} />
      <div className="flex-1 flex flex-col min-w-0">
        {topBarConfig.show ? <TopBar /> : <TabBar onRefresh={onRefresh} onBackToList={onBackToList} />}
        <main className="flex-1 overflow-hidden relative">{children}</main>
        <BottomBar onMenuClick={onMenuOpen} onNewPage={onNewPage} />
      </div>
    </div>
  );
};

export default AppFrame;
