import { create } from "zustand";

export type Theme = "light" | "dark" | "hacker" | "terminal" | "ocean" | "sunset" | "nord" | "solarized";
export type Locale = "en" | "zh";

interface AppState {
  theme: Theme;
  locale: Locale;
  isMenuOpen: boolean;

  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
  setLocale: (locale: Locale) => void;
  toggleLocale: () => void;
  setMenuOpen: (open: boolean) => void;
}

const THEME_ORDER: Theme[] = ["light", "dark", "hacker", "terminal", "ocean", "sunset", "nord", "solarized"];

export const useAppStore = create<AppState>((set, get) => ({
  theme: "light",
  locale: "zh",
  isMenuOpen: false,

  setTheme: (theme) => set({ theme }),
  toggleTheme: () => {
    const { theme } = get();
    const nextIndex = (THEME_ORDER.indexOf(theme) + 1) % THEME_ORDER.length;
    set({ theme: THEME_ORDER[nextIndex] });
  },
  setLocale: (locale) => set({ locale }),
  toggleLocale: () => set((s) => ({ locale: s.locale === "en" ? "zh" : "en" })),
  setMenuOpen: (open) => set({ isMenuOpen: open }),
}));
