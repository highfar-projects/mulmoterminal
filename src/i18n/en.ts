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

    stepper: {
      decrease: "Decrease {label}",
      increase: "Increase {label}",
    },

    theme: {
      missing: "The selected theme {id} is not defined. Add it to {themesKey} in {configFile}, or pick one below. Your choice is kept until then.",
      intro:
        "Picks from the schemes that exist. Your own go in {themesKey} in {configFile} and appear here next to the built-in four — the skill writes one from a palette, a photo or a brand's colours, and checks it for contrast.",
      group: "Theme",
      create: "Create a theme…",
    },

    font: {
      intro:
        "The CSS font-family stack every terminal renders in. Reach for it when CJK text looks wrong — a stack whose first face has no Japanese glyphs falls back per character, and the line stops lining up. Leave it empty for the built-in stack. A directory can pin its own with {key} in its {dirFile}.",
      field: "Terminal font family stack",
      apply: "Apply",
      invalid:
        "Not a font stack. Separate names with commas — {example}. CSS syntax characters and unbalanced quotes are refused, because one bad entry invalidates the whole declaration.",
      hint: "Open terminals re-fit as soon as this lands — a different face has a different advance width, so the grid would drift from the canvas otherwise. {mono} is appended when you name no generic family, so a stack that matches nothing still falls back to a fixed-width face.",
    },

    fontSize: {
      stepper: "terminal font size",
      hint: "Applies to every terminal on this browser. A directory can pin its own with {key} in its {dirFile}.",
    },

    scroll: {
      stepper: "terminal scroll speed",
      hint: "How far one wheel notch or trackpad swipe moves the terminal — 1× is the default. Lower it if a two-finger scroll on a Mac trackpad flies past what you were reading. Per browser, and it covers both a shell's scrollback and a full-screen app like Claude Code.",
      returnLabel: "Return to the latest output when you send",
      returnHint:
        "pressing Enter (or a send button) takes a scrolled-up terminal back to the bottom, the way an ordinary terminal does. A shell already behaves this way; a full-screen agent like Claude Code keeps its own scroll position and does not, so this unwinds exactly the scrolling you did. Turn it off to stay where you are reading while a turn runs.",
    },

    waitingRows: {
      intro:
        "In the list beside an enlarged cell, a row whose agent is {waiting} — a permission prompt, a question — carries an amber ring and blinks. A row that has simply {finished} is green and holds still. Turning this off keeps both colours and stops the movement; rows never blink when your system asks for reduced motion.",
      waiting: "waiting on you",
      finished: "finished",
      blink: "Blink a row that is waiting on me",
      linesTitle: "Lines per row",
      linesHint: "how much of each row is shown before it clamps. Raising these trades how many sessions fit on screen for reading a long one in place.",
      fields: {
        summary: "Summary",
        prompt: "Your prompt",
        response: "Last reply",
      },
      steppers: {
        summary: "summary line count",
        prompt: "your prompt line count",
        response: "last reply line count",
      },
    },

    cost: {
      intro:
        "Estimated spend for this project from {pricing} (input, output, and cache tokens) — actual billing may differ, and flat-plan (Max) usage isn't reflected. Today / Month roll up this project's sessions.",
      pricing: "public per-model pricing",
      group: "Estimated cost",
      groupTitle: "Estimated from public per-model pricing; actual billing may differ.",
      session: "Session",
      today: "Today",
      month: "Month",
      failed: "Couldn't load cost estimate.",
      unpriced: "Some turns used a model with no known price and are excluded from these estimates.",
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
