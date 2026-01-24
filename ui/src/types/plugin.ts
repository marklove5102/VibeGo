import type { LucideIcon } from "lucide-react";
import type React from "react";
import type { BottomBarButton, TopBarButton } from "./frame";

export interface PageMenuConfig {
  id: string;
  icon: React.ReactNode;
  label: string;
  badge?: string | number;
  onClick?: () => void;
}

export interface PageFrameConfig {
  topBar?: {
    leftButtons?: TopBarButton[];
    centerContent?: string | React.ReactNode;
    rightButtons?: TopBarButton[];
    show?: boolean;
  };
  bottomBar?: {
    menuItems?: PageMenuConfig[];
    rightButtons?: BottomBarButton[];
    show?: boolean;
  };
  tabBar?: {
    enabled?: boolean;
    actionIcon?: "plus" | "refresh";
    actionLabel?: string;
  };
}

export interface PluginContext {
  groupId: string;
  tabId: string | null;
  isActive: boolean;
}

export interface PluginViewProps {
  isActive: boolean;
  context?: PluginContext;
}

export interface Plugin {
  id: string;
  name: string;
  nameKey?: string;
  icon: LucideIcon;
  order?: number;
  view: React.ComponentType<PluginViewProps>;
  getFrameConfig?: (context: PluginContext) => PageFrameConfig;
  getMenuItems?: (context: PluginContext) => PageMenuConfig[];
}
