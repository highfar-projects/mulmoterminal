// What the Settings sidebar offers: one tab per section, under the group it belongs to (#1563).
//
// The label lives here rather than in the section component, and the section renders no heading of
// its own — the sidebar entry and the pane heading are the same words, and two copies of a string is
// how one of them ends up saying something the other doesn't (#1097).
//
// Group order, and the order within each group, are expected access frequency — the same rule
// MulmoClaude's own GROUPS table states for the sidebar this one follows.

export type SettingsTabId =
  | "theme"
  | "font"
  | "fontSize"
  | "scroll"
  | "waitingRows"
  | "dirAppearance"
  | "dirSettings"
  | "launchers"
  | "headerChrome"
  | "terminalKeys"
  | "shortcuts"
  | "voice"
  | "models"
  | "mcp"
  | "sounds"
  | "push"
  | "quickCommands"
  | "github"
  | "prRepos"
  | "google"
  | "sessions"
  | "surviving"
  | "cost"
  | "help";

export interface SettingsTab {
  id: SettingsTabId;
  label: string;
}

export interface SettingsGroup {
  key: string;
  label: string;
  tabs: readonly SettingsTab[];
}

export const SETTINGS_GROUPS: readonly SettingsGroup[] = [
  {
    key: "appearance",
    label: "Appearance",
    tabs: [
      { id: "theme", label: "Theme" },
      { id: "font", label: "Terminal font" },
      { id: "fontSize", label: "Terminal font size" },
      { id: "scroll", label: "Terminal scroll speed" },
      { id: "waitingRows", label: "Waiting rows" },
    ],
  },
  {
    key: "projects",
    label: "Projects",
    tabs: [
      { id: "dirAppearance", label: "Directory appearance" },
      { id: "dirSettings", label: "Directory settings" },
    ],
  },
  {
    key: "launch",
    label: "Header & launch",
    tabs: [
      { id: "launchers", label: "Launch commands" },
      { id: "headerChrome", label: "Header buttons and chips" },
    ],
  },
  {
    key: "input",
    label: "Input",
    tabs: [
      { id: "terminalKeys", label: "Terminal keys" },
      { id: "shortcuts", label: "Keyboard shortcuts" },
      { id: "voice", label: "Voice input" },
    ],
  },
  {
    key: "models",
    label: "Models & servers",
    tabs: [
      { id: "models", label: "Models and backends" },
      { id: "mcp", label: "MCP servers" },
    ],
  },
  {
    key: "notifications",
    label: "Notifications",
    tabs: [
      { id: "sounds", label: "Notification sounds" },
      { id: "push", label: "Web Push notifications" },
      { id: "quickCommands", label: "Phone quick commands" },
    ],
  },
  {
    key: "integrations",
    label: "Integrations",
    tabs: [
      { id: "github", label: "GitHub and GitLab" },
      { id: "prRepos", label: "Pull request repos" },
      { id: "google", label: "Google account" },
    ],
  },
  {
    key: "sessions",
    label: "Sessions",
    tabs: [
      { id: "sessions", label: "Sessions and background tasks" },
      { id: "surviving", label: "Sessions that survived a restart" },
      { id: "cost", label: "Cost (estimated)" },
    ],
  },
  {
    key: "help",
    label: "Help",
    tabs: [{ id: "help", label: "Help & user guide" }],
  },
];

export const SETTINGS_TABS: readonly SettingsTab[] = SETTINGS_GROUPS.flatMap((group) => group.tabs);

// Where the modal opens. A choice, not "whatever sorts first": Theme is the setting most people
// come here for and the cheapest pane to render.
export const DEFAULT_SETTINGS_TAB: SettingsTabId = "theme";

export const settingsTabLabel = (id: SettingsTabId): string => SETTINGS_TABS.find((tab) => tab.id === id)?.label ?? "";

export const isSettingsTabId = (value: string): value is SettingsTabId => SETTINGS_TABS.some((tab) => tab.id === value);
