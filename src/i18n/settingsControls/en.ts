export const settingsControlsEn = {
  defaultAgent: {
    title: "Default agent",
    hint: "What a new cell's launch form starts on until you pick something there, and the agent MulmoTerminal checks is installed when it starts.",
    field: "Default agent",
    unset: "Not set (Claude)",
    notInstalled: "{agent} (not installed)",
    overridden: "Saved. This run was started with --agent, which wins until MulmoTerminal is started without it.",
  },
  headerTint: {
    title: "Status colour on the header",
    hint: "How a terminal's header shows that its session is working or done. A directory can set its own in its .mulmoterminal.json.",
    field: "Status colour on the header",
    tints: {
      background: "Wash the header in the status colour",
      none: "Keep the directory's colour (the border, dot and pill show the status)",
    },
  },
  headerColors: {
    title: "Header colour per status",
    hint: "Replace the theme's colour for one status on every terminal's header. A directory's own .mulmoterminal.json replaces the whole set for that directory.",
    statuses: {
      working: "Working",
      done: "Done",
      blocked: "Needs input",
    },
    background: "Background",
    text: "Text",
    theme: "Theme's",
    auto: "Auto",
    autoState: "Auto (readable)",
    partOf: "{part} for “{status}”",
    reset: "Back to the theme",
  },
  configReload: {
    button: "Reload config file",
    tip: "Read ~/.mulmoterminal/config.json again after editing it by hand or with an agent. The page reloads to show it.",
  },
  playful: {
    title: "Playful effects",
    hint: "Now and then, something on a terminal. Off keeps every terminal plain.",
    field: "Playful effects",
  },
};
