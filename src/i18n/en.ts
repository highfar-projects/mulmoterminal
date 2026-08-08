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

    push: {
      intro:
        "Send a push to your registered devices when a background task finishes. Requires the {remoteHost} connection — its sign-in provides the notification auth, so pushes only send while it's connected.",
      remoteHost: "RemoteHost",
      master: "Send a Web Push to my devices",
      masterLabel: "Notify my devices",
      whichMoments: "Which moments are worth a push:",
      kindAria: "Push when a session is {kind}",
      kinds: {
        finished: "Turn finished",
        waiting: "Waiting for you",
      },
      help: {
        finished: "the agent replied and the output is unread",
        waiting: "it stopped to ask — a permission prompt or a question. Fires once per prompt, so a task that asks a lot pushes a lot",
      },
    },

    github: {
      issueComments: "Comment on the issue a cell is working on",
      issueCommentsTitle: "Say when work starts on an issue",
      issueCommentsHint:
        "one comment, posted as the work starts and edited as the PR opens and merges. It names the working directory (the folder name, never the path), so two terminals do not start the same issue twice. Needs {gh} (or {glab}) logged in.",
      prFooter: "End a created PR with the clone name",
      prFooterHint: "a {line} line at the bottom of the body, so a PR says which of several side-by-side clones produced it.",
      gitlabTitle: "Self-hosted GitLab",
      gitlabHint:
        "a URL does not say which forge a host runs, so declare it here to have its repos read with {glab}. Needs {authCommand}. Takes effect on the next server start.",
      gitlabField: "Add a self-hosted GitLab host",
    },

    sessions: {
      summary: "End replies with a closing summary",
      summaryHint:
        "what was asked, what was achieved, what was not, under a rule. It exists for the grid: coming back to a cell later, that is otherwise only recoverable by scrolling the whole session. Applies to sessions started from now on; a directory's own {dirFile} wins over this.",
      digest: "Keep a digest of decisions",
      digestTitle: "Keep a digest of what this project decided",
      digestHint: "a Markdown file an agent can read before asking something the project already settled. Writes under {dir}.",
      worklog: "Keep a periodic dev-work log",
      worklogHint: "summarizes recent work across your saved working directories into weekly wiki pages. Each run spawns an LLM session, so it costs tokens.",
      worklogInterval: "How often it runs:",
      worklogStepper: "dev-work log interval",
    },

    launchers: {
      intro:
        "Any interactive command a grid cell can run — a dev server, a REPL, a git UI, a model bridge. It runs in the cell's directory as a persistent terminal, exactly as written. Example: {labelExample} → {commandExample}.",
      notAnAgent: "To start Claude, Codex or Antigravity, use the Agent Picker in an empty cell instead — a launcher gives you none of what a session needs.",
      labelField: "Launcher label",
      labelPlaceholder: "Label",
      commandField: "Launcher command",
      commandPlaceholder: "command (e.g. $SHELL)",
    },

    quickCommands: {
      intro:
        "Phrases you send often, offered as chips on the phone's terminal view. Tapping one puts the text in the input box — it isn't sent until you press send. The label is the chip's face, so keep it short. Example: {labelExample} → {textExample}. Leave every kind unchecked to offer a command everywhere, or tick the ones it suits — {gitStatus} belongs to a shell, not to Claude.",
      labelField: "Quick command label",
      labelPlaceholder: "Label",
      textField: "Quick command text",
      textPlaceholder: "text to insert (e.g. PR作って)",
      offerTo: "Offer to:",
      offerToAgent: "Offer to {agent} sessions",
      offerToNone: "(none ticked = every kind)",
    },

    mcp: {
      intro:
        "HTTP MCP servers the {singleView} Claude session loads (in addition to the built-in GUI tools). {idKey} is the server name; {urlKey} is its streamable-HTTP endpoint. In the Docker sandbox, a {localhost} URL is reached over {dockerHost} automatically. Takes effect on the next Claude session.",
      singleView: "single-view",
      idField: "MCP server id",
      idPlaceholder: "id (e.g. weather)",
      urlField: "MCP server URL",
      urlPlaceholder: "https://… or http://localhost:PORT/mcp",
    },

    headerChrome: {
      intro:
        "The action buttons and the read-out chips along a terminal's header. Globally you have {buttons} and {chips}; a project can add or replace its own by id in its {dirFile}, so what a given terminal shows is the two merged.",
      builtInButtons: "built-in buttons",
      noButtons: "no buttons (all removed)",
      someButtons: "{count} button | {count} buttons",
      builtInChips: "built-in chips",
      noChips: "no chips (all removed)",
      someChips: "{count} chip | {count} chips",
      setUp: "Set up header buttons…",
    },

    models: {
      intro:
        "Anthropic-compatible backends a session can run on, from {providersKey} in {configFile}. A directory can pin one with {providerKey} / {modelKey} in its {dirFile}. A key lives in the environment, never in the config.",
      modelCount: "{count} model | {count} models",
      keyIn: "key in {env}",
      notReady: "not ready",
      notInPicker: "not in the picker",
      ready: "ready",
      noProviders: "None configured — sessions run on the built-in default.",
      customTitle: "Your own way of starting Claude Code",
      customIntro:
        "— offered in the Agent Picker beside Claude / Codex / Antigravity / Shell. Not a launcher: Claude Code's own arguments are appended to the command, so the cell resumes, reports cost and reaches the GUI tools like any other Claude session.",
      noCustomAgents: "None configured.",
      addBackend: "Add a backend…",
    },

    common: {
      add: "Add",
      remove: "Remove {name}",
    },

    dirAppearance: {
      intro:
        "Launch the {skill} skill to style and order your directories — name badge, icon, colors, terminal palette, grid position. It starts from the directories you actually open, reads the settings you already have, and follows the same pattern for the ones that have none.",
      configure: "Configure appearance…",
      favicon: "Use a project's own favicon",
      faviconHint:
        "a directory that sets no {iconKey} shows the one its repository already ships ({svg}, {png}, a web manifest). A project that wants none sets {iconFalse} in its own {dirFile}, which this does not override.",
    },

    dirSettings: {
      intro:
        "What each directory's {dirFile} is actually doing. Expand one to see the values in force, and any key the app dropped or doesn't recognise — a setting that never took effect looks the same as one you never made until you can see this.",
      outro: "This lists what is wrong; the skill reads the same thing and says why, then fixes it or points you at whichever skill owns that key.",
      explain: "Explain my settings…",
    },

    google: {
      intro:
        "Link a Google account so the {tool} tool and your phone can read and create {calendar} events. Sign-in opens in a new tab and finishes on {thisMachine}, so use a browser here — over a remote connection, run {cli} instead. The link is shared with MulmoClaude.",
      calendar: "Calendar",
      thisMachine: "this machine",
      checking: "Checking…",
      pending: "Waiting for consent in your browser…",
      linked: "Linked",
      notLinked: "Not linked",
      signIn: "Sign in with Google",
      unlink: "Unlink",
      confirmUnlink: "Unlink this Google account? MulmoTerminal will lose Calendar access until you sign in again.",
      secretMissing:
        "No OAuth client secret found in ~/.secrets. Add a Desktop client's client_secret_*.json there to enable sign-in, or use the GCP-settings-free broker link if available.",
      secretAmbiguous: "Multiple client_secret_*.json files in ~/.secrets — keep exactly one.",
    },

    prRepos: {
      intro: "Repos whose open PRs the cross-repo {view} view lists. Uses your {gh} login. Format: {format}.",
      view: "Pull requests",
      field: "Add a repository (owner/repo)",
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
