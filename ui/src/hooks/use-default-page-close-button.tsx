import { X } from "lucide-react";
import { useMemo } from "react";
import { useTranslation } from "@/lib/i18n";
import { useAppStore, useFrameStore, useSessionStore } from "@/stores";
import type { TopBarButton } from "@/stores/frame-store";

export function useDefaultPageCloseButton(): TopBarButton | null {
  const locale = useAppStore((s) => s.locale);
  const t = useTranslation(locale);
  const groups = useFrameStore((s) => s.groups);
  const activeGroup = useFrameStore((s) => s.getActiveGroup());
  const removeGroup = useFrameStore((s) => s.removeGroup);
  const closeFolderGroup = useSessionStore((s) => s.closeFolderGroup);

  return useMemo(() => {
    if (!activeGroup) {
      return null;
    }
    if (activeGroup.type === "home" && groups.length <= 1) {
      return null;
    }

    const isFolderGroup = activeGroup.type === "group" && activeGroup.pages.some((p) => p.path);

    return {
      icon: <X size={18} />,
      title: isFolderGroup ? t("common.closeFolder") : t("common.closePage"),
      onClick: async () => {
        if (isFolderGroup) {
          await closeFolderGroup(activeGroup.id);
          return;
        }
        removeGroup(activeGroup.id);
      },
    };
  }, [activeGroup, closeFolderGroup, groups.length, removeGroup, t]);
}
