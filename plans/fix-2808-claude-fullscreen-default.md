# Claude cells start with the fullscreen renderer off unless the user chose it (#2808)

## Problem

Claude Code's fullscreen renderer draws on the alternate screen, which has no scrollback: the cell
loses its scrollbar and a selection cannot grow past one screen (MulmoTerminal sends the wheel to
Claude as mouse reports and keeps drags as its own selection). Since Claude Code 2.1.28x the renderer
can turn on by itself when `tui` is unset — a fresh install, or a server-side rollout gate — so a
cell changed under users who never asked.

## How Claude Code decides (read from 2.1.284, then measured)

1. `CLAUDE_CODE_NO_FLICKER` false, or `CLAUDE_CODE_DISABLE_ALTERNATE_SCREEN` set -> off. Checked
   BEFORE the `tui` setting.
2. `CLAUDE_CODE_NO_FLICKER` true -> on.
3. `tui: "fullscreen"` -> on, `tui: "default"` -> off.
4. `tui` unset -> fresh install or rollout gate.

Measured in tmux with a scratch `CLAUDE_CONFIG_DIR` holding `"tui": "fullscreen"`: no env -> alternate
screen on; `CLAUDE_CODE_NO_FLICKER=0` or `=false` -> off. So passing the variable unconditionally
would override an explicit choice.

## Change

`server/session/claude-fullscreen.ts` (pure) decides; `claude-fullscreen-env.ts` reads the files.
Every claude spawn (plain and custom agent) adds `CLAUDE_CODE_NO_FLICKER=0` only when:

- none of `<session home>/settings.json`, `<cwd>/.claude/settings.json`,
  `<cwd>/.claude/settings.local.json` has a top-level string `tui`, and
- neither `CLAUDE_CODE_NO_FLICKER` nor `CLAUDE_CODE_DISABLE_ALTERNATE_SCREEN` is in the server env.

The session home is the bound account's for a second login, else `CLAUDE_CONFIG_DIR` or `~/.claude`.
A missing or unparseable file decides nothing.

FAQ entry in `docs/guide/{en,ja}/faq.md`.

## Not in this change

- Managed settings (`managed-settings.json`) are not read. A `tui` set only there is overridden;
  the worst case is the classic renderer.
- Passing drags to Claude while it is fullscreen, so its own selection works (option B in #2808).
