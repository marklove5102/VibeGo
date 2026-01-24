import type { ReactNode } from "react";

export type GroupType = "home" | "group" | "terminal" | "plugin" | "settings";

export type PageType = "files" | "git" | "terminal";

export interface TopBarButton {
  icon: ReactNode;
  label?: string;
  onClick?: () => void;
  active?: boolean;
  disabled?: boolean;
}

export interface TopBarConfig {
  leftButtons?: TopBarButton[];
  centerContent?: string | ReactNode;
  rightButtons?: TopBarButton[];
  show?: boolean;
}

export interface BottomBarButton {
  icon: ReactNode;
  label?: string;
  onClick?: () => void;
  active?: boolean;
  disabled?: boolean;
}

export interface BottomMenuItem {
  id: string;
  icon: ReactNode;
  label: string;
  badge?: string | number;
  onClick?: () => void;
}

export interface BottomBarConfig {
  customItems?: BottomMenuItem[];
  activeItemId?: string;
  rightButtons?: BottomBarButton[];
  show?: boolean;
}

export interface TabItem {
  id: string;
  title: string;
  icon?: string;
  data?: Record<string, unknown>;
  closable?: boolean;
  pinned?: boolean;
}

export interface GroupPage {
  id: string;
  type: PageType;
  label: string;
  path?: string;
  tabs: TabItem[];
  activeTabId: string | null;
}

export interface GenericGroup {
  type: "group";
  id: string;
  name: string;
  pages: GroupPage[];
  activePageId: string | null;
}

export interface TerminalGroup {
  type: "terminal";
  id: string;
  name: string;
  tabs: TabItem[];
  activeTabId: string | null;
}

export interface PluginGroup {
  type: "plugin";
  id: string;
  name: string;
  pluginId: string;
  tabs: TabItem[];
  activeTabId: string | null;
}

export interface SettingsGroup {
  type: "settings";
  id: string;
  name: string;
}

export interface HomeGroup {
  type: "home";
  id: string;
  name: string;
}

export type PageGroup = HomeGroup | GenericGroup | TerminalGroup | PluginGroup | SettingsGroup;

export type ViewType = PageType;
