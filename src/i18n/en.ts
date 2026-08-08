// The Settings modal's words, in English. This is the fallback bundle, so a key another locale has
// not translated yet renders these words rather than the key itself.
//
// Only the Settings modal is here. The rest of the app is still hardcoded English and moves surface
// by surface (#1566) — a half-migrated tree with no rule about what is in it is worse than a small
// one with a stated edge.
//
// `groups.*` and `tabs.*` are keyed by the ids in components/settings/settingsTabs.ts, which is why
// that table holds no words. A spec pins that every id there has a message here and in every other
// locale.
export const en = {
  settings: {
    title: "Settings",
    close: "Close",
    closeAria: "Close settings",
    sectionsNav: "Settings sections",
    sectionPicker: "Settings section",

    groups: {
      appearance: "Appearance",
      projects: "Projects",
      launch: "Header & launch",
      input: "Input",
      models: "Models & servers",
      notifications: "Notifications",
      integrations: "Integrations",
      sessions: "Sessions",
      help: "Help",
    },

    tabs: {
      language: "Language",
      theme: "Theme",
      font: "Terminal font",
      fontSize: "Terminal font size",
      scroll: "Terminal scroll speed",
      waitingRows: "Waiting rows",
      dirAppearance: "Directory appearance",
      dirSettings: "Directory settings",
      launchers: "Launch commands",
      headerChrome: "Header buttons and chips",
      terminalKeys: "Terminal keys",
      shortcuts: "Keyboard shortcuts",
      voice: "Voice input",
      models: "Models and backends",
      mcp: "MCP servers",
      sounds: "Notification sounds",
      push: "Web Push notifications",
      quickCommands: "Phone quick commands",
      github: "GitHub and GitLab",
      prRepos: "Pull request repos",
      google: "Google account",
      sessions: "Sessions and background tasks",
      surviving: "Sessions that survived a restart",
      cost: "Cost (estimated)",
      help: "Help & user guide",
    },

    language: {
      intro:
        "The language this app's own buttons and labels are written in. Kept per browser, like the theme — a phone and a desktop can each have their own. It does not touch what your agent writes, or what the terminal shows.",
      picker: "Language for this app",
      auto: "My browser's language",
      autoResolved: "Your browser asks for {locale}, so this reads as {label}.",
      partial: "Only Settings is translated so far. The rest of the app is still in English.",
    },
  },
} as const;
