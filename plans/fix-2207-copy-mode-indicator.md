# fix: say when a pane is in tmux copy-mode, and give a way back to input (#2207)

## Problem

A pane whose program asks for no mouse reports (a shell, and Codex's inline TUI) goes into tmux
copy-mode on a wheel-up or a drag — the root `WheelUpPane` / `MouseDrag1Pane` bindings do
`copy-mode -e` / `copy-mode -M` when neither `alternate_on` nor `mouse_any_flag` is set. From then
on every key goes to copy-mode: under `mode-keys vi` hjkl move a cursor, other letters do nothing,
and nothing on screen says why beyond tmux's small `[0/123]` position marker.

Reproduced against a scratch tmux server using `~/.mulmoterminal/tmux.conf`, with Codex in its
normal screen (`alternate_on=0 mouse_any_flag=0`): a wheel-up report and a drag both put the pane
in `copy-mode`; `hjkl` typed there never reached Codex; after `send-keys -X cancel` typed text did.

## Scope

In: detect copy-mode on the pane the user is working in, show a banner saying so and how to leave,
and a button that leaves it without sending anything to the agent.

Out: stopping copy-mode from being entered by accident (#1898 territory). The bindings stay as they
are — copy-mode is how a shell cell scrolls its history, and hjkl / selection / copy inside it keep
working.

## Design

- **Detection is driven by input, not polled.** Entering and leaving copy-mode are both caused by
  input to that pane (wheel, drag, keys), and every one of those arrives as an `input` frame. So
  after an input frame to a tmux session — and when a pane comes into view, and on reattach — the
  server asks tmux `#{pane_in_mode}` for THAT pane once, after a short settle so a burst of input
  costs one probe. Idle sessions cost nothing, whatever their number.
- A `paneMode` frame (`{ inCopyMode }`) goes to the browser only when the answer changes. A
  reattach forgets what was last sent, because the new socket starts from "not in copy-mode".
- Probes carry a ticket so a slow answer cannot overwrite a newer one.
- The browser sends `exitCopyMode`; the server runs `send-keys -X cancel` on the pane (sends no
  bytes to the program) and probes again.
- Known gap: copy-mode entered from outside this app (a separate `tmux attach`) is seen only on the
  next input from the browser. That is also the moment it matters.

## Files

- `server/infra/tmux.ts` — `parsePaneInMode`, `tmuxPaneInMode`, `tmuxCancelCopyMode`.
- `server/session/pane-mode-watch.ts` — settle + ticket + send-on-change.
- `server/session/pty-connection.ts` — hook input / view / reattach, accept `exitCopyMode`.
- `server/index.ts` — wiring, forget on reap.
- `src/composables/serverMessage.ts`, `useTerminalConnections.ts` — `inCopyMode` on `connView`,
  `exitCopyMode(key)`.
- `src/components/Terminal.vue` — the banner; words in `src/i18n/*`.
