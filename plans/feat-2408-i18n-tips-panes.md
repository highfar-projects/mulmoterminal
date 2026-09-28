# feat: translate the side panes' tooltips and aria-labels (#2408, part 3a)

Part 3 of #2408 was 29 files, twice part 1, so it is split: **3a** the side panes (this), **3b**
the overlays and menus. Parts 1 and 2: `plans/feat-2408-i18n-tips-cell.md`,
`plans/feat-2408-i18n-tips-launch.md`.

## Change

- `src/i18n/tips/*.ts`: a `tips.panes` section in all five bundles.
- The six side panes (tools, conversation, prompts, question, canvas, collections) share one set
  of controls — expand, restore, close — and each pane words them as whole sentences
  (`tips.panes.<pane>.*`), so a noun is never slotted into a sentence.
- The files pane, file search and finder, the files overlay, the copy-code button, the activity
  timeline and the collection chat strip take every tip and aria-label (including the region /
  navigation landmarks' names) from `t()`. `CollectionChatPane`'s status words are a key table
  (`STATUS_KEY`), and its tab hover is one message.
- `FilesPane` passes translated `label`s to `FilesToolbarButton`, which renders its prop as the tip.
- `tipCensus.ts`: a hard-coded tip is now any of three shapes — a plain attribute, a capitalised
  quote or ANY template literal inside a bound one (a backtick there assembles a sentence), or a
  capitalised prop on a component that renders that prop as its tip. The second and third shapes
  were missed until this part: `FilesPane`'s four toolbar labels passed the census and showed
  English on screen.

## Not translated

Paths, timeline event summaries, AI titles and prompts, agent names, session ids.

## Left for 3b / 4

`CollectionsBrowseOverlay`'s `LaunchAgentPicker` props (3b); `AppToolbar`'s `LauncherButton`
props (4).
