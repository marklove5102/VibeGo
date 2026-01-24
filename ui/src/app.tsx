import React, { useCallback, useEffect, useState } from "react";
import { fileApi } from "@/api/file";
import { DirectoryPicker, NewPageMenu, ProjectMenu, useDialog } from "@/components/common";
import { FileManager } from "@/components/file";
import { AppFrame, NewGroupMenu } from "@/components/frame";
import { ConflictView, DiffView, GitView } from "@/components/git";
import { HomePage } from "@/components/home";
import { FilePreview } from "@/components/preview";
import { SettingsPage } from "@/components/settings";
import { TerminalPage } from "@/components/terminal";
import { useSettingsStore } from "@/lib/settings";
import { pluginRegistry } from "@/plugins/registry";
import { initTerminalCleanup } from "@/services/terminal-cleanup-service";
import {
  type FileItem,
  type Locale,
  type Theme,
  useAppStore,
  useFileManagerStore,
  useFrameStore,
  useGitStore,
  usePreviewStore,
  useSessionStore,
} from "@/stores";
import type { GenericGroup, PluginGroup } from "@/stores/frame-store";
import "@/plugins";

const App: React.FC = () => {
  const { theme, locale, isMenuOpen, setMenuOpen, setTheme, setLocale } = useAppStore();
  const dialog = useDialog();

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
  const openPreviewTab = useFrameStore((s) => s.openPreviewTab);
  const addPluginGroup = useFrameStore((s) => s.addPluginGroup);
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

  const handleGitDiff = useCallback(
    (original: string, modified: string, title: string, filename?: string) => {
      addCurrentTab({
        id: `diff-${Date.now()}`,
        title,
        data: {
          type: "diff",
          original,
          modified,
          filename,
        },
      });
    },
    [addCurrentTab]
  );

  const handleConflict = useCallback(
    (repoPath: string, filePath: string) => {
      const fileName = filePath.split("/").pop() || filePath;
      addCurrentTab({
        id: `conflict-${Date.now()}`,
        title: `${fileName} [CONFLICT]`,
        data: {
          type: "conflict",
          repoPath,
          filePath,
        },
      });
    },
    [addCurrentTab]
  );

  const handleFileOpen = useCallback(
    (file: FileItem) => {
      openPreviewTab({
        id: `tab-${file.path}`,
        title: file.name,
        data: { type: "code", path: file.path, file },
      });
    },
    [openPreviewTab]
  );

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
            const newPath = await dialog.prompt("New file name:", { placeholder: "Enter file name..." });
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
    } else if (activeGroup.type === "terminal") {
    } else if (activeGroup.type === "plugin") {
      addCurrentTab({
        id: `plugin-tab-${Date.now()}`,
        title: `${activeGroup.name} ${tabs.length + 1}`,
        data: { type: "plugin", pluginId: activeGroup.pluginId },
      });
    }
  }, [activeGroup, currentPage, currentPath, addCurrentTab, tabs.length, activeTabId]);

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

  const handleOpenFolder = useCallback(
    async (path: string) => {
      await createSessionFromFolder(path);
    },
    [createSessionFromFolder]
  );

  const handleNewPlugin = useCallback(
    (pluginId: string) => {
      addPluginGroup(pluginId, pluginId);
    },
    [addPluginGroup]
  );

  const activeTab = tabs.find((t) => t.id === activeTabId);

  const renderPluginPage = (group: PluginGroup) => {
    const plugin = pluginRegistry.get(group.pluginId);
    if (!plugin) {
      return (
        <div className="h-full flex items-center justify-center text-ide-mute">Plugin not found: {group.pluginId}</div>
      );
    }
    const PluginView = plugin.view;
    return (
      <PluginView
        isActive={true}
        context={{
          groupId: group.id,
          tabId: activeTabId,
          isActive: true,
        }}
      />
    );
  };

  const renderGroupPage = (group: GenericGroup) => {
    if (!currentPage) return null;
    const pagePath = currentPage.path || "";

    switch (currentPage.type) {
      case "git":
        if (activeTabId === null) {
          return <GitView path={pagePath} locale={locale} onFileDiff={handleGitDiff} onConflict={handleConflict} isActive={true} />;
        }
        if (activeTab?.data?.type === "diff") {
          return (
            <DiffView
              original={(activeTab.data.original as string) || ""}
              modified={(activeTab.data.modified as string) || ""}
              filename={(activeTab.data.filename as string) || undefined}
            />
          );
        }
        if (activeTab?.data?.type === "conflict") {
          return (
            <ConflictView
              repoPath={(activeTab.data.repoPath as string) || ""}
              filePath={(activeTab.data.filePath as string) || ""}
              locale={locale}
              onResolve={async (content) => {
                const { resolveConflict, fetchStatus, fetchConflicts } = useGitStore.getState();
                await resolveConflict(activeTab.data.filePath as string, content);
                await fetchStatus();
                await fetchConflicts();
              }}
              onCancel={() => {
                useFrameStore.getState().removeCurrentTab(activeTab.id);
              }}
            />
          );
        }
        return null;

      case "terminal":
        return <TerminalPage groupId={group.id} cwd={pagePath} />;

      case "files":
        if (activeTabId !== null && activeTab) {
          const tabFile = activeTab.data?.file as FileItem | undefined;
          return (
            <FilePreview
              file={
                tabFile || {
                  path: (activeTab.data?.path as string) || activeTab.id,
                  name: activeTab.title,
                  size: 0,
                  isDir: false,
                  isSymlink: false,
                  isHidden: false,
                  mode: "",
                  modTime: "",
                  extension: activeTab.title.includes(".") ? `.${activeTab.title.split(".").pop()}` : "",
                }
              }
            />
          );
        }
        return <FileManager initialPath={pagePath} onFileOpen={handleFileOpen} />;

      default:
        return null;
    }
  };

  const renderContent = () => {
    if (!activeGroup) return null;

    switch (activeGroup.type) {
      case "home":
        return <HomePage onOpenFolder={handleOpenFolder} locale={locale} />;
      case "settings":
        return <SettingsPage />;
      case "terminal":
        return <TerminalPage groupId={activeGroup.id} />;
      case "plugin":
        return renderPluginPage(activeGroup);
      case "group":
        return renderGroupPage(activeGroup);
      default:
        return null;
    }
  };

  return (
    <>
      <AppFrame onMenuOpen={() => setMenuOpen(true)} onTabAction={handleTabAction} onBackToList={handleBackToList} onNewPage={() => setNewPageMenuOpen(true)}>
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
        onNewPlugin={handleNewPlugin}
      />
      <NewGroupMenu
        isOpen={isNewGroupMenuOpen}
        onClose={() => setNewGroupMenuOpen(false)}
        onOpenDirectory={handleOpenDirectory}
        onNewPlugin={handleNewPlugin}
        availablePlugins={[
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
    </>
  );
};

export default App;
