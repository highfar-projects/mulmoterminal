# feat: translate the toolbar's tooltips and aria-labels (#2408, part 4a)

Part 4 is split like part 3: **4a** the toolbar (this), **4b** the rate-limit gauge
(`rateLimitGauge.ts` assembles its English over some 200 lines) and the Settings line that says
what is translated. Settings itself was already translated apart from user data.

## Change

- `src/i18n/tips/*.ts`: a `tips.toolbar` section in all five bundles.
- `AppToolbar`, `NotificationBell`, `RemoteHostControl`, `MachineLoadGauge`: every tip, aria-label
  and tip-rendering prop (`LauncherButton` / `ToolbarPopover`) from `t()`.
- Four pure helpers keep deciding and stop wording: `gridStatusSummary` returns its parts as keys
  and counts (`gridStatusTitle(summary, translate)` joins them), `soundButtonState` a `labelKey`,
  `machineLoadReadout` the hover's `titleParams`, `useGithubStar` a `titleKey`. Their specs keep
  every decision they pinned and read the words through the real messages.
- Counts that used to pick a plural in code ("1 chat" / "N chats", "1 notification" / "N
  notifications") are two messages each.

## Not translated

The update badge's text (the server's own notice), pinned collections' and feeds' titles, agent
names, "Wiki" (a name).
