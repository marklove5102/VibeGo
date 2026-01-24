import { useSyncExternalStore } from "react";
import { type Plugin, pluginRegistry } from "./registry";

export function usePlugins(): Plugin[] {
  return useSyncExternalStore(
    (cb) => pluginRegistry.subscribe(cb),
    () => pluginRegistry.getAll()
  );
}

export function usePlugin(id: string): Plugin | undefined {
  const plugins = usePlugins();
  return plugins.find((p) => p.id === id);
}
