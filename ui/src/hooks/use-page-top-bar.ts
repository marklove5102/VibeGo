import { type DependencyList, useEffect } from "react";
import { useFrameController } from "@/framework/frame/controller";
import type { TopBarConfig } from "@/stores/frame-store";

export function usePageTopBar(config: TopBarConfig | null | undefined, deps: DependencyList) {
  const { setTopBarConfig } = useFrameController();

  useEffect(() => {
    if (config === undefined) {
      return;
    }
    if (config) {
      setTopBarConfig(config);
    } else {
      setTopBarConfig({ show: false });
    }
  }, deps);

  useEffect(() => {
    return () => {
      setTopBarConfig({ show: false });
    };
  }, [setTopBarConfig]);
}
