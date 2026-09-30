# feat: experimental `remoteServer` — withhold what acts on the server's screen (#2669)

Second step of #2669, experimental and OFF by default, so nothing changes for anyone who does not
set it. Nothing can detect a remote browser: through an SSH tunnel its connection comes from
loopback, like a local one.

## `{ "remoteServer": true }` in the server's `~/.mulmoterminal/config.json`

- Defined once in `common/remoteServer.ts`; `app-config.ts` loads / saves / sends it like
  `paletteSearchBox`; the client reads it through `createGlobalFlag` (`src/composables/remoteServer.ts`).
- Hidden: the path menu's *Insert a file path* and *Reveal in the file manager*, the launch form's
  folder button.
- Declined with a reason at the one call each goes through: `pickPaths` (every file dialog),
  `revealDir` (header `open.reveal`, `terminal-reveal`), `askTheMachine` (Files pane reveal and
  open-in-OS).
- Drop: `dropPlan` (pure, in `dropPaths.ts`) decides insert / upload / hint; with the flag, files
  are always uploaded. With it off the plan is the old rule, compared over every input shape in the spec.

## Not in this step

A Settings switch, detecting it automatically, an official image.
