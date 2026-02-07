import React, { useCallback, useEffect, useState } from "react";
import { fileApi } from "@/api/file";
import { DirectoryPicker, NewPageMenu, ProjectMenu, useDialog } from "@/components/common";
import { AppFrame, NewGroupMenu } from "@/components/frame";
import { Toaster } from "@/components/ui/sonner";
import { useTranslation } from "@/lib/i18n";
import { useSettingsStore } from "@/lib/settings";
import { pageRegistry } from "@/pages/registry";
import { initTerminalCleanup } from "@/services/terminal-cleanup-service";
import {
  type Locale,
  type Theme,
  useAppStore,
  useFileManagerStore,
  useFrameStore,
  usePreviewStore,
  useSessionStore,
} from "@/stores";
import type { GenericGroup, ToolGroup } from "@/stores/frame-store";
import "@/pages";

const App: React.FC = () => {
  const { theme, locale, isMenuOpen, setMenuOpen, setTheme, setLocale } = useAppStore();
  const dialog = useDialog();
  const t = useTranslation(locale);

  const resetPreview = usePreviewStore((s) => s.reset);
  const { currentPath } = useFileManagerStore();
  const initSettings = useSettingsStore((s) => s.init);
  const themeSetting = useSettingsStore((s) => s.settings.theme);
  const localeSetting = useSettingsStore((s) => s.settings.locale);
  const fontFamily = useSettingsStore((s) => s.settings.fontFamily);

  const activeGroup = useFrameStore((s) => s.getActiveGroup());
  const currentPage = useFrameStore((s) => s.getCurrentPage());
  const activeTabId = useFrameStore((s) => s.getCurrentActiveTabId());
  const tabs = useFrameStore((s) => s.getCurrentTabs());
  const addCurrentTab = useFrameStore((s) => s.addCurrentTab);
  const addToolGroup = useFrameStore((s) => s.addToolGroup);
  const addSettingsGroup = useFrameStore((s) => s.addSettingsGroup);
  const initDefaultGroups = useFrameStore((s) => s.initDefaultGroups);
  const showHomePage = useFrameStore((s) => s.showHomePage);

  const saveCurrentSession = useSessionStore((s) => s.saveCurrentSession);

  const [isNewGroupMenuOpen, setNewGroupMenuOpen] = useState(false);
  const [isNewPageMenuOpen, setNewPageMenuOpen] = useState(false);
  const [isDirectoryPickerOpen, setDirectoryPickerOpen] = useState(false);

  useEffect(() => {
    initSettings();
    initTerminalCleanup();
  }, [initSettings]);

  const initSession = useSessionStore((s) => s.initSession);

  useEffect(() => {
    const init = async () => {
      const hasSession = await initSession();
      if (!hasSession) {
        initDefaultGroups();
      }
    };
    init();
  }, [initSession, initDefaultGroups]);

  useEffect(() => {
    const handleBeforeUnload = () => {
      saveCurrentSession();
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [saveCurrentSession]);

  useEffect(() => {
    if (themeSetting) setTheme(themeSetting as Theme);
  }, [themeSetting, setTheme]);

  useEffect(() => {
    if (localeSetting) setLocale(localeSetting as Locale);
  }, [localeSetting, setLocale]);

  useEffect(() => {
    if (fontFamily && fontFamily !== "default") {
      document.body.setAttribute("data-font", fontFamily);
    } else {
      document.body.removeAttribute("data-font");
    }
  }, [fontFamily]);

  useEffect(() => {
    const root = document.documentElement;
    const body = document.body;
    root.className = "";
    body.classList.remove("scanlines");
    switch (theme) {
      case "dark":
        root.classList.add("dark");
        break;
      case "hacker":
        root.classList.add("dark", "hacker");
        break;
      case "terminal":
        root.classList.add("dark", "terminal");
        body.classList.add("scanlines");
        break;
    }
  }, [theme]);

  const handleBackToList = useCallback(() => {
    resetPreview();
  }, [resetPreview]);

  const handleTabAction = useCallback(async () => {
    if (!activeGroup) return;

    if (activeGroup.type === "group") {
      const pageType = currentPage?.type;
      switch (pageType) {
        case "files":
          if (activeTabId === null) {
            useFileManagerStore.getState().setLoading(true);
            const path = useFileManagerStore.getState().currentPath;
            try {
              const res = await fileApi.list(path);
              const files = res.files.map((f) => ({
                path: f.path,
                name: f.name,
                size: f.size,
                isDir: f.isDir,
                isSymlink: f.isSymlink,
                isHidden: f.isHidden,
                mode: f.mode,
                mimeType: f.mimeType,
                modTime: f.modTime,
                extension: f.extension,
              }));
              useFileManagerStore.getState().setFiles(files);
            } finally {
              useFileManagerStore.getState().setLoading(false);
            }
          } else {
            const newPath = await dialog.prompt(t("dialog.newFileName"), { placeholder: t("dialog.enterFileName") });
            if (newPath) {
              await fileApi.create({
                path: `${currentPath}/${newPath}`,
                isDir: false,
              });
            }
          }
          break;
        case "terminal":
          break;
        case "git":
          break;
      }
    } else if (activeGroup.type === "tool") {
      const page = pageRegistry.get(activeGroup.pageId);
      const title = page?.nameKey ? t(page.nameKey) : page?.name || activeGroup.name;
      addCurrentTab({
        id: `tool-tab-${Date.now()}`,
        title: `${title} ${tabs.length + 1}`,
        data: { type: "page", pageId: activeGroup.pageId },
      });
    }
  }, [activeGroup, currentPage, currentPath, addCurrentTab, tabs.length, activeTabId, dialog, t]);

  const handleOpenDirectory = useCallback(() => {
    setDirectoryPickerOpen(true);
  }, []);

  const createSessionFromFolder = useSessionStore((s) => s.createSessionFromFolder);

  const handleDirectorySelect = useCallback(
    async (path: string) => {
      await createSessionFromFolder(path);
      setDirectoryPickerOpen(false);
    },
    [createSessionFromFolder]
  );

  const handleNewTool = useCallback(
    (pageId: string) => {
      addToolGroup(pageId, pageId);
    },
    [addToolGroup]
  );

  const renderToolPage = (group: ToolGroup) => {
    const page = pageRegistry.get(group.pageId);
    if (!page) {
      return (
        <div className="h-full flex items-center justify-center text-ide-mute">
          {t("common.pageNotFound")}: {group.pageId}
        </div>
      );
    }
    const View = page.View;
    return <View context={{ groupId: group.id, tabId: activeTabId, isActive: true }} />;
  };

  const renderGroupPage = (group: GenericGroup) => {
    if (!currentPage) return null;

    const page = pageRegistry.get(currentPage.type);
    if (!page) {
      return (
        <div className="h-full flex items-center justify-center text-ide-mute">
          {t("common.pageNotFound")}: {currentPage.type}
        </div>
      );
    }
    const View = page.View;
    return <View context={{ groupId: group.id, tabId: activeTabId, isActive: true, path: currentPage.path }} />;
  };

  const renderContent = () => {
    if (!activeGroup) return null;

    switch (activeGroup.type) {
      case "home": {
        const page = pageRegistry.get("home");
        if (!page) return null;
        const View = page.View;
        return <View context={{ groupId: activeGroup.id, tabId: null, isActive: true }} />;
      }
      case "settings": {
        const page = pageRegistry.get("settings");
        if (!page) return null;
        const View = page.View;
        return <View context={{ groupId: activeGroup.id, tabId: null, isActive: true }} />;
      }
      case "tool":
        return renderToolPage(activeGroup);
      case "group":
        return renderGroupPage(activeGroup);
      default:
        return null;
    }
  };

  return (
    <>
      <AppFrame
        onMenuOpen={() => setMenuOpen(true)}
        onTabAction={handleTabAction}
        onBackToList={handleBackToList}
        onNewPage={() => setNewPageMenuOpen(true)}
      >
        {renderContent()}
      </AppFrame>
      <ProjectMenu
        isOpen={isMenuOpen}
        onClose={() => setMenuOpen(false)}
        locale={locale}
        onOpenSettings={addSettingsGroup}
        onShowHomePage={showHomePage}
        onNewPage={() => setNewPageMenuOpen(true)}
      />
      <NewPageMenu
        isOpen={isNewPageMenuOpen}
        onClose={() => setNewPageMenuOpen(false)}
        locale={locale}
        onOpenDirectory={handleOpenDirectory}
        onNewTool={handleNewTool}
      />
      <NewGroupMenu
        isOpen={isNewGroupMenuOpen}
        onClose={() => setNewGroupMenuOpen(false)}
        locale={locale}
        onOpenDirectory={handleOpenDirectory}
        onNewTool={handleNewTool}
        availableTools={[
          { id: "claude-code", name: "Claude Code" },
          { id: "gemini-cli", name: "Gemini CLI" },
        ]}
      />
      <DirectoryPicker
        isOpen={isDirectoryPickerOpen}
        onClose={() => setDirectoryPickerOpen(false)}
        onSelect={handleDirectorySelect}
        initialPath="."
        locale={locale}
      />
      <Toaster />
    </>
  );
};

export default App;
