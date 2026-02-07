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
  const currentSessionId = useSessionStore((s) => s.currentSessionId);
  const deleteSession = useSessionStore((s) => s.deleteSession);

  return useMemo(() => {
    if (!activeGroup) {
      return null;
    }
    if (activeGroup.type === "home" && groups.length <= 1) {
      return null;
    }

    return {
      icon: <X size={18} />,
      title: activeGroup.type === "group" ? t("common.closeFolder") : t("common.closePage"),
      onClick: async () => {
        if (activeGroup.type === "group" && currentSessionId) {
          await deleteSession(currentSessionId);
          return;
        }
        removeGroup(activeGroup.id);
      },
    };
  }, [activeGroup, currentSessionId, deleteSession, groups.length, removeGroup, t]);
}
