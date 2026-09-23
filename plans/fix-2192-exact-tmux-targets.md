# fix(tmux): resolve every session target exactly, and check the phone's id at the door (#2192)

## The defect

`tmux -t NAME` resolves by PREFIX when nothing matches exactly. `server/infra/tmux.ts` builds every
target as the bare `mt-<id>`, so an id that is merely the beginning of a live session's name reaches
that other session — on `kill-session` as well as on `capture-pane`.

It is reachable today. `getTerminalScreen` in `server/backends/remoteHost/handlers/terminalSession.ts`
takes the phone's `sessionId` with no shape check and hands it to `captureTerminalScreen` →
`tmuxCaptureStyledPane` → `capture-pane -t mt-<id>`. A phone can send a leading fragment of an id and
read a session it did not name. The sibling transcript handler checks the shape; this one does not.

## What was measured, not assumed

tmux 3.6a, on an isolated socket (`-L`), holding only `mt-<uuid>-suffix`. The probe scripts are in the
PR body; each row is an exit code plus stdout.

1. **Bare `-t` prefix-matches on every subcommand this file drives** — `has-session`, `kill-session`,
   `capture-pane`, `display-message`, `list-clients` all answer for `mt-<uuid>` while only
   `mt-<uuid>-suffix` exists. `display-message` returns the OTHER session's `#{session_name}`.
2. **The exact-match spelling differs by target KIND, and this is the trap.**
   - A target-**session** (`has-session`, `kill-session`, `list-clients`) takes `=NAME`.
   - A target-**pane** (`capture-pane`, `display-message`) takes `=NAME:`. Given the bare `=NAME` it
     resolves NOTHING, even when the session exists exactly: `capture-pane` exits 1, and
     `display-message` **exits 0 and prints an empty line**.
   So the one-liner the issue proposed — `=${tmuxSessionName(id)}` everywhere — would have silently
   disabled pane command, terminal modes, window size and attached-client count on every session,
   with exit 0 and no error anywhere.
3. **`new-session -A -s NAME` is already exact**: asked to attach to `mt-<uuid>` while only
   `mt-<uuid>-suffix` was held, it created a new session rather than attaching. `-s` is a name, not a
   target. Unchanged.
4. **`refresh-client -t <tty>`** takes a target-client, not a session. Unchanged.

## The change

- `server/infra/tmux.ts` — two builders, `tmuxSessionTarget(id)` and `tmuxPaneTarget(id)`, and every
  `-t` that names a session goes through the one for its kind. Nothing else about the commands moves.
- `server/backends/remoteHost/handlers/terminalSession.ts` — one extractor reads `sessionId` from the
  phone's params and checks BOTH presence and shape, and every handler that reads it uses that. The
  file's comment currently says a shape check is only needed where an id becomes a file path; that is
  the assumption this issue disproves, so it is rewritten rather than extended.

## What holds it

- A source-derived guard over `tmux.ts`: every `-t` in the file is followed by one of the two builders
  or is on the allow-listed `refresh-client` line. A new call site that spells its own target fails the
  spec rather than re-opening the hole quietly.
- Per-builder spelling tests, including the negative that cost the most: a pane target is `=NAME:`, and
  `=NAME` is not a pane target.
- A handler spec per entry point: a malformed id is refused before anything is built out of it.

## Blast radius

`tmuxHasSession` is the reattach decision, so this is verified by running the server: spawn, detach,
reattach, capture, resize, kill. Every name the app creates is exactly `mt-<uuid>`, so exact matching
must change nothing that worked.
