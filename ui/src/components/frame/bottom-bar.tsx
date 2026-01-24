import { Box, Files, FolderOpen, GitGraph, Home, Maximize, Menu, Minimize, Plus, Settings, Terminal } from "lucide-react";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { pluginRegistry } from "@/plugins/registry";
import {
  type BottomBarButton,
  type GenericGroup,
  type PageGroup,
  type PageType,
  type PluginGroup,
  useFrameStore,
} from "@/stores/frame-store";

interface BottomBarProps {
  onMenuClick?: () => void;
  onNewPage?: () => void;
}

const PAGE_TYPE_ICONS: Record<PageType, React.ReactNode> = {
  files: <Files size={18} />,
  git: <GitGraph size={18} />,
  terminal: <Terminal size={18} />,
};

const GROUP_TYPE_ICONS = {
  home: <Home size={18} />,
  group: <FolderOpen size={18} />,
  terminal: <Terminal size={18} />,
  plugin: <Box size={18} />,
  settings: <Settings size={18} />,
};

interface GroupButtonProps {
  group: PageGroup;
  isActive: boolean;
  isExpanded: boolean;
  hasMultipleGroups: boolean;
  onGroupClick: (groupId: string) => void;
  onPageClick: (groupId: string, pageId: string) => void;
}

const getPluginIcon = (pluginId: string): React.ReactNode => {
  const plugin = pluginRegistry.get(pluginId);
  if (plugin) {
    const IconComponent = plugin.icon;
    return <IconComponent size={18} />;
  }
  return <Box size={18} />;
};

const GroupButton: React.FC<GroupButtonProps> = ({
  group,
  isActive,
  isExpanded,
  hasMultipleGroups,
  onGroupClick,
  onPageClick,
}) => {
  if (group.type === "group") {
    const genericGroup = group as GenericGroup;
    if (isExpanded) {
      return (
        <div
          className={`flex h-full items-center gap-0.5 px-1 ${
            hasMultipleGroups ? "bg-ide-panel/70 border border-ide-border/30 rounded-md shadow-inner" : ""
          }`}
        >
          {genericGroup.pages.map((page) => (
            <button
              key={page.id}
              onClick={() => onPageClick(group.id, page.id)}
              className={`px-2 h-full rounded flex items-center transition-all ${
                isActive && genericGroup.activePageId === page.id
                  ? "text-ide-accent"
                  : "text-ide-mute hover:text-ide-text"
              }`}
              title={page.label}
            >
              {PAGE_TYPE_ICONS[page.type] || <Box size={18} />}
            </button>
          ))}
        </div>
      );
    }
    return (
      <button
        onClick={() => onGroupClick(group.id)}
        className={`px-3 h-full rounded flex items-center gap-2 transition-all ${
          isActive ? "bg-ide-panel text-ide-accent shadow-sm" : "text-ide-mute hover:text-ide-text"
        }`}
        title={group.name}
      >
        {GROUP_TYPE_ICONS.group}
      </button>
    );
  }

  if (group.type === "plugin") {
    const pluginGroup = group as PluginGroup;
    return (
      <button
        onClick={() => onGroupClick(group.id)}
        className={`px-3 h-full rounded flex items-center gap-2 transition-all ${
          isActive ? "bg-ide-panel text-ide-accent shadow-sm" : "text-ide-mute hover:text-ide-text"
        }`}
        title={group.name}
      >
        {getPluginIcon(pluginGroup.pluginId)}
      </button>
    );
  }

  return (
    <button
      onClick={() => onGroupClick(group.id)}
      className={`px-3 h-full rounded flex items-center gap-2 transition-all ${
        isActive ? "bg-ide-panel text-ide-accent shadow-sm" : "text-ide-mute hover:text-ide-text"
      }`}
      title={group.name}
    >
      {GROUP_TYPE_ICONS[group.type] || GROUP_TYPE_ICONS.plugin}
    </button>
  );
};

const BottomBar: React.FC<BottomBarProps> = ({ onMenuClick, onNewPage }) => {
  const groups = useFrameStore((s) => s.groups);
  const activeGroupId = useFrameStore((s) => s.activeGroupId);
  const bottomBarConfig = useFrameStore((s) => s.bottomBarConfig);
  const setActiveGroup = useFrameStore((s) => s.setActiveGroup);
  const setActivePage = useFrameStore((s) => s.setActivePage);
  const setCurrentActiveTab = useFrameStore((s) => s.setCurrentActiveTab);

  const [compactMode] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const lastClickTime = useRef<Record<string, number>>({});
  const [isFullscreen, setIsFullscreen] = useState(false);
  const cornerButtonClass =
    "shrink-0 w-8 h-8 rounded-md text-ide-accent hover:bg-ide-accent hover:text-ide-bg flex items-center justify-center border border-ide-border transition-colors";

  const handleGroupClick = useCallback(
    (groupId: string) => {
      const now = Date.now();
      const lastClick = lastClickTime.current[groupId] || 0;

      if (now - lastClick < 300 && activeGroupId === groupId) {
        setCurrentActiveTab(null);
      }

      lastClickTime.current[groupId] = now;
      setActiveGroup(groupId);
    },
    [activeGroupId, setActiveGroup, setCurrentActiveTab]
  );

  const handlePageClick = useCallback(
    (groupId: string, pageId: string) => {
      setActiveGroup(groupId);
      setActivePage(groupId, pageId);
    },
    [setActiveGroup, setActivePage]
  );

  const shouldExpand = (group: PageGroup) => {
    if (group.type !== "group") return false;
    if (compactMode) return activeGroupId === group.id;
    return true;
  };

  const handleToggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen?.({ navigationUI: "hide" });
      return;
    }
    document.exitFullscreen?.();
  }, []);

  useEffect(() => {
    const handleChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    handleChange();
    document.addEventListener("fullscreenchange", handleChange);
    return () => document.removeEventListener("fullscreenchange", handleChange);
  }, []);

  const rightButtons: BottomBarButton[] =
    bottomBarConfig.rightButtons && bottomBarConfig.rightButtons.length > 0
      ? bottomBarConfig.rightButtons
      : [
          {
            icon: isFullscreen ? <Minimize size={18} /> : <Maximize size={18} />,
            label: isFullscreen ? "Exit Fullscreen" : "Fullscreen",
            onClick: handleToggleFullscreen,
            active: isFullscreen,
          },
        ];

  if (!bottomBarConfig.show) {
    return null;
  }

  const useCustomItems = bottomBarConfig.customItems && bottomBarConfig.customItems.length > 0;
  const hasMultipleGroups = groups.length > 1;
  const isOnlyHome = groups.length === 1 && groups[0].type === "home";
  const showGroupBar = groups.length > 0 && !useCustomItems && !isOnlyHome;

  return (
    <>
      <footer className="h-14 pb-safe bg-ide-panel border-t border-ide-border flex items-center justify-between z-20 shadow-[0_-5px_15px_rgba(0,0,0,0.1)]">
        <button onClick={onMenuClick} className="h-full px-4 flex items-center gap-3">
          <div className={cornerButtonClass}>
            <Menu size={18} />
          </div>
        </button>

        {showGroupBar ? (
          <div
            ref={containerRef}
            className="flex h-10 bg-ide-bg rounded-lg p-1 border border-ide-border gap-1 overflow-x-auto no-scrollbar max-w-[70vw]"
          >
            {groups.map((group) => (
              <GroupButton
                key={group.id}
                group={group}
                isActive={activeGroupId === group.id}
                isExpanded={shouldExpand(group)}
                hasMultipleGroups={hasMultipleGroups}
                onGroupClick={handleGroupClick}
                onPageClick={handlePageClick}
              />
            ))}
          </div>
        ) : useCustomItems ? (
          <div
            ref={containerRef}
            className="flex h-10 bg-ide-bg rounded-lg p-1 border border-ide-border gap-1 overflow-x-auto no-scrollbar max-w-[70vw]"
          >
            {bottomBarConfig.customItems!.map((item) => (
              <button
                key={item.id}
                onClick={item.onClick}
                className={`px-3 h-full rounded flex items-center gap-2 transition-all relative ${
                  bottomBarConfig.activeItemId === item.id
                    ? "bg-ide-panel text-ide-accent shadow-sm"
                    : "text-ide-mute hover:text-ide-text"
                }`}
                title={item.label}
              >
                {item.icon}
                {item.badge && (
                  <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] rounded-full px-1 min-w-[16px] h-4 flex items-center justify-center">
                    {item.badge}
                  </span>
                )}
              </button>
            ))}
          </div>
        ) : isOnlyHome && onNewPage ? (
          <div
            ref={containerRef}
            className="flex h-10 bg-ide-bg rounded-lg p-1 border border-ide-border gap-1 overflow-x-auto no-scrollbar"
          >
            <button
              onClick={onNewPage}
              className="px-3 h-full rounded flex items-center gap-2 transition-all text-ide-mute hover:text-ide-accent"
              title="New Page"
            >
              <Plus size={18} />
            </button>
          </div>
        ) : (
          <div className="flex-1" />
        )}

        <div className="flex items-center gap-2 px-4">
          {rightButtons.map((button, index) => (
            <button
              key={index}
              onClick={button.onClick}
              disabled={button.disabled}
              title={button.label}
              className={`${cornerButtonClass} ${button.active ? "bg-ide-accent text-ide-bg border-ide-accent" : ""} ${button.disabled ? "opacity-50 cursor-not-allowed" : ""}`}
            >
              {button.icon}
            </button>
          ))}
        </div>
      </footer>
    </>
  );
};

export default BottomBar;
