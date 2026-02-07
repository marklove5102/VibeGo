export type SettingType = "select" | "toggle" | "text" | "number";

export interface SettingOption {
  value: string;
  label: string;
  description?: string;
}

export interface SettingSchema {
  key: string;
  type: SettingType;
  category: string;
  labelKey: string;
  descriptionKey?: string;
  defaultValue: string;
  options?: SettingOption[];
  min?: number;
  max?: number;
}

export const SETTINGS_SCHEMA: SettingSchema[] = [
  {
    key: "theme",
    type: "select",
    category: "appearance",
    labelKey: "settings.theme.label",
    descriptionKey: "settings.theme.description",
    defaultValue: "light",
    options: [
      { value: "light", label: "settings.theme.optionLight" },
      { value: "dark", label: "settings.theme.optionDark" },
      { value: "hacker", label: "settings.theme.optionHacker" },
      { value: "terminal", label: "settings.theme.optionTerminal" },
    ],
  },
  {
    key: "locale",
    type: "select",
    category: "appearance",
    labelKey: "settings.locale.label",
    descriptionKey: "settings.locale.description",
    defaultValue: "zh",
    options: [
      { value: "en", label: "settings.locale.optionEnglish" },
      { value: "zh", label: "settings.locale.optionChinese" },
    ],
  },
  {
    key: "fontFamily",
    type: "select",
    category: "appearance",
    labelKey: "settings.fontFamily.label",
    descriptionKey: "settings.fontFamily.description",
    defaultValue: "jetbrains-mono",
    options: [
      { value: "default", label: "settings.fontFamily.optionDefault" },
      { value: "jetbrains-mono", label: "JetBrains Mono" },
    ],
  },
  {
    key: "showHiddenFiles",
    type: "toggle",
    category: "fileManager",
    labelKey: "settings.showHiddenFiles.label",
    descriptionKey: "settings.showHiddenFiles.description",
    defaultValue: "false",
  },
  {
    key: "defaultViewMode",
    type: "select",
    category: "fileManager",
    labelKey: "settings.defaultViewMode.label",
    descriptionKey: "settings.defaultViewMode.description",
    defaultValue: "list",
    options: [
      { value: "list", label: "settings.defaultViewMode.optionList" },
      { value: "grid", label: "settings.defaultViewMode.optionGrid" },
    ],
  },
  {
    key: "editorFontSize",
    type: "number",
    category: "editor",
    labelKey: "settings.editorFontSize.label",
    descriptionKey: "settings.editorFontSize.description",
    defaultValue: "14",
    min: 10,
    max: 24,
  },
  {
    key: "editorTabSize",
    type: "select",
    category: "editor",
    labelKey: "settings.editorTabSize.label",
    descriptionKey: "settings.editorTabSize.description",
    defaultValue: "2",
    options: [
      { value: "2", label: "2" },
      { value: "4", label: "4" },
      { value: "8", label: "8" },
    ],
  },
  {
    key: "editorWordWrap",
    type: "toggle",
    category: "editor",
    labelKey: "settings.editorWordWrap.label",
    descriptionKey: "settings.editorWordWrap.description",
    defaultValue: "false",
  },
  {
    key: "gitUserName",
    type: "text",
    category: "git",
    labelKey: "settings.gitUserName.label",
    descriptionKey: "settings.gitUserName.description",
    defaultValue: "",
  },
  {
    key: "gitUserEmail",
    type: "text",
    category: "git",
    labelKey: "settings.gitUserEmail.label",
    descriptionKey: "settings.gitUserEmail.description",
    defaultValue: "",
  },
  {
    key: "gitCommitTimeMode",
    type: "select",
    category: "git",
    labelKey: "settings.gitCommitTimeMode.label",
    descriptionKey: "settings.gitCommitTimeMode.description",
    defaultValue: "client",
    options: [
      { value: "client", label: "settings.gitCommitTimeMode.optionClient" },
      { value: "increment", label: "settings.gitCommitTimeMode.optionIncrement" },
    ],
  },
];

export const SETTING_CATEGORIES = [
  { key: "appearance", labelKey: "settings.category.appearance" },
  { key: "fileManager", labelKey: "settings.category.fileManager" },
  { key: "editor", labelKey: "settings.category.editor" },
  { key: "git", labelKey: "settings.category.git" },
];

export function getSettingsByCategory(category: string): SettingSchema[] {
  return SETTINGS_SCHEMA.filter((s) => s.category === category);
}

export function getSettingSchema(key: string): SettingSchema | undefined {
  return SETTINGS_SCHEMA.find((s) => s.key === key);
}

export function getDefaultSettings(): Record<string, string> {
  const defaults: Record<string, string> = {};
  for (const schema of SETTINGS_SCHEMA) {
    defaults[schema.key] = schema.defaultValue;
  }
  return defaults;
}
