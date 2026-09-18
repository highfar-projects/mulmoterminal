# fix #2125 — `Cmd+Shift+<uppercase letter>` is dead on macOS and nothing said so

## The defect

`"files-find": "Cmd+Shift+P"` loads, shows up in Settings as bound, and never fires. Not a parse
failure, not a collision — the binding is well-formed and simply cannot match.

While Cmd is held, a macOS browser puts the **unshifted** character in `KeyboardEvent.key`:

| pressed | `KeyboardEvent.key` |
|---|---|
| `Shift`+`P` | `"P"` |
| `Cmd`+`Shift`+`P` | `"p"` |

`matchesBinding` compares `e.key` to the parsed key exactly, and that case-sensitivity is
deliberate (`"a"` and `"A"` are different keystrokes, pinned by `test/common/keymap.spec.ts`). So
`parseKeyBinding("Cmd+Shift+P")` yields `{ key: "P", shift: true, meta: true }` and waits for a
`"P"` that never arrives. `"Cmd+Shift+p"` fires on the identical keystroke.

Nothing in the repo could tell the user, and `validateKeymap` — which already has a non-fatal
warning channel, used for an unknown action and for two claims on one keystroke — was silent.

## Evidence

- The event pasted in #2125, captured from a real macOS Chrome:
  `key: "p" code: "KeyP" metaKey: true shiftKey: true`.
- [w3c/uievents#169](https://github.com/w3c/uievents/issues/169) — Safari and Chrome both report
  the lowercase `key` for `Cmd`+`Shift`+letter, against the spec; open since 2017. So this is the
  platform, not something to route around.
- Root cause underneath the browsers: AppKit's `charactersIgnoringModifiers` drops Shift as well
  once Command is down, and that is what the engines read.

**What was NOT measured here.** This session could not post synthetic OS-level keystrokes (macOS
denied `osascript` the keystroke permission), and a Playwright/CDP keypress cannot reproduce it —
CDP supplies `key` itself instead of going through the OS translation. So the platform fact rests
on the reporter's capture plus the w3c issue, both external to this change. `Ctrl`+`Shift`+letter,
`Cmd`+`Shift`+punctuation and Firefox were not measured by anyone, and the fix deliberately says
nothing about them.

## The fix: say so, do not change what matching means

`validateKeymap` now emits a **non-fatal** problem for a binding that is `meta` + `shift` + a single
uppercase ASCII letter, naming the lowercase spelling that works. It covers both an action and a
`send` entry, because both go through the same parser and the same matcher.

Non-fatal, and platform-free, because the same entry is **correct** for a Windows or Linux browser
(`Meta`+`Shift`+`P` really does report `"P"` there) and the server cannot know which browser will
connect — the phone remote view and a Mac browser against a Linux host are both normal here. The
message names macOS so a reader on another platform can dismiss it.

`enforceKeymap`'s warning headline said *"ignoring unknown keymap entries"*, which was already wrong
for a duplicate-keystroke warning and would have been a flat lie here (the entry is kept). It now
says these entries will not do what they say, which is true of all three warning kinds.

### Deliberately not done

- **Matching was not made case-insensitive under Cmd.** It would make the config do what it says,
  but it changes every keystroke's dispatch in the browser, needs `canonicalBinding` taught the
  same equality or duplicate detection goes blind, and re-points a rule the specs pin. The issue
  asks to be told; being told costs nothing at runtime.
- **No UI change.** The browser is the one place that *knows* its platform and could mark the row
  in Settings → Keyboard shortcuts with certainty. That is a real follow-up, and a wider blast
  radius than this issue needs.
- **No warning for `Cmd`+uppercase letter without `Shift`.** `"Cmd+P"` is unmatchable everywhere
  (an uppercase `key` arrives only with Shift held, which the binding then rejects) — but Caps Lock
  is a counter-example, and the case is not what was reported.

## Where the rule now lives

- `common/keymap.ts` — the warning, with the reason in a comment.
- `test/common/keymap.spec.ts` — the warning, *and* the platform fact itself run through
  `actionForKey` with the event a real Mac delivers. A comment would have rotted; this goes red if
  matching ever changes under it.
- `server/skills/mulmoterminal-keys/SKILL.md` — the skill is the **writer** of `keymap` (Settings is
  read-only), so a rule it does not carry is a rule that keeps being broken. It wrote the dead
  binding in #2125.
- `docs/guide/{en,ja}/config.md` — beside the `F1`–`F12` and `Option`+letter traps, which are the
  same shape.
