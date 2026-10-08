# feat: the Run menu's scripts and the Skill menu's skills as command-palette rows (#2697)

## Change

The command palette lists the acting terminal's Run-menu scripts (`Run: <label>`) and Skill-menu
skills (`Skill: /<slug>`) as rows in the `>` scope. A pick does what the menu does: a script runs
in a new command cell through the terminal's `run` emit, a skill is submitted into the session
through `onSkill` (`skillSeed(slug, agent)`).

## Decisions

- **The terminal says whether it offers the menus.** `paletteHeaderEntries` gains `menus()`, which
  is `null` unless the terminal has `runMenu` (command and launcher cells do not), and otherwise
  carries the directory the menus read and the two run paths. The palette never decides this itself.
- **The palette reads the lists itself while it is open**, from the same endpoints the menus read
  (`/api/scripts`, `/api/skills`), in the shape `usePaletteResumes` uses. The skill row guard moves
  to `useDirLists.ts` so the menu and the palette parse one way.
- **The script's `RunCommand` is built by one function** (`scriptRunCommand`) that RunMenu and the
  palette both call, so the cwd rule (the list's resolved dir, else the terminal's) cannot drift.
- **Not remembered by frecency**: a script's key is its index in one directory's script.json and a
  skill's slug is per project, so neither names the same row in another terminal.
- **No shortcut per script or skill**; they are rows to pick.

## Out of scope

- The Mulmo menu (decks) — not asked for.
- Changing how RunMenu / SkillMenu fetch or render.
