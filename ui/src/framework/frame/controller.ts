import { useFrameStore } from "@/stores/frame-store";

export function useFrameController() {
  const setTopBarConfig = useFrameStore((s) => s.setTopBarConfig);
  const setBottomBarConfig = useFrameStore((s) => s.setBottomBarConfig);
  const setPageMenuItems = useFrameStore((s) => s.setPageMenuItems);

  return {
    setTopBarConfig,
    setBottomBarConfig,
    setPageMenuItems,
  };
}

