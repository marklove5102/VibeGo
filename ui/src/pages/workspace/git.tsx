import { GitGraph } from "lucide-react";
import React, { useCallback } from "react";
import { ConflictView, DiffView, GitView } from "@/components/git";
import { useAppStore } from "@/stores/app-store";
import { useFrameStore, useGitStore } from "@/stores";
import { registerPage } from "../registry";
import type { PageViewProps } from "../types";

const GitViewPage: React.FC<PageViewProps> = ({ context }) => {
  const locale = useAppStore((s) => s.locale);
  const tabs = useFrameStore((s) => s.getCurrentTabs());
  const activeTabId = useFrameStore((s) => s.getCurrentActiveTabId());
  const openPreviewTab = useFrameStore((s) => s.openPreviewTab);
  const addCurrentTab = useFrameStore((s) => s.addCurrentTab);
  const removeCurrentTab = useFrameStore((s) => s.removeCurrentTab);

  const activeTab = tabs.find((t) => t.id === activeTabId);

  const handleGitDiff = useCallback(
    (original: string, modified: string, title: string, filename?: string) => {
      openPreviewTab({
        id: `diff-${filename || title}`,
        title,
        data: {
          type: "diff",
          original,
          modified,
          filename,
        },
      });
    },
    [openPreviewTab]
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

  const pagePath = context.path || "";

  if (activeTabId === null) {
    return (
      <GitView
        path={pagePath}
        locale={locale}
        onFileDiff={handleGitDiff}
        onConflict={handleConflict}
        isActive={true}
      />
    );
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
          const { resolveConflict } = useGitStore.getState();
          await resolveConflict(activeTab.data?.filePath as string, content);
        }}
        onCancel={() => {
          removeCurrentTab(activeTab.id);
        }}
      />
    );
  }

  return null;
};

registerPage({
  id: "git",
  name: "Git",
  icon: GitGraph,
  category: "workspace",
  order: 20,
  View: GitViewPage,
});

export default GitViewPage;

