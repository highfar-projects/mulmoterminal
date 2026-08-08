# Guide screenshots

Captured from a **throwaway demo instance** (a fresh `HOME`, empty config seeded with neutral demo data
— `acme-web` / `acme-api`, `Shell` / `Node REPL` launchers), so no personal session data appears. Retina
(`deviceScaleFactor: 2`), 1440×900 viewport.

**Except when a terminal is in frame.** xterm draws to a canvas it scales by the device pixel ratio
itself, so at `deviceScaleFactor: 2` the terminal text bakes in at double size while the rest of the
UI stays correct — the shot comes out with a giant terminal beside normal chrome. Capture those at
`deviceScaleFactor: 1` and accept 1× resolution. The two `worktree-close-*.png` are 1280×540 at 1×
for this reason.

**Or don't emulate the scale factor at all.** A headful browser with `defaultViewport: null`, sized to 1440×900 through CDP `Browser.setWindowBounds`, screenshots at the display's own retina ratio — xterm scales its canvas by the same ratio the rest of the page uses, so nothing bakes in at double size. Downscale the 2880×1800 result to 1440×900 afterwards. The three `v4.2.0-*.png` were captured this way.

| File | Shows |
|---|---|
| `single-view.png` | The single view (chat + GUI panel) |
| `grid-launch-form.png` | An empty grid cell's launcher form (dir / Claude·Codex / worktree / launch commands) |
| `grid-one-cell.png` | One running cell — the two-row header, git chip, `connected` |
| `grid-two-cells.png` | Two parallel terminals |
| `grid-2x2.png` | Four parallel terminals (2×2) |
| `grid-zoom.png` | Expanded cell + filmstrip thumbnails |
| `settings.png` | The Settings modal before the sidebar (#1563) — one flat scroll. Kept for the dated v2.1.0 / v2.2.0 pages, which describe that screen |
| `settings-tabs.png` | The Settings modal's sidebar of grouped sections, with **Notification sounds** open |
| `settings-japanese.png` | The same modal in Japanese, on a `ja-JP` browser with nothing configured |
| `config-settings-modal.png` | The Settings modal's sidebar, scrolled to show the first eight groups (**Appearance** down to **Sessions**; **Help** is below the fold), with **Theme** open |
| `config-dir-settings.png` | One expanded Directory-settings row — values in force with colour swatches, the file they came from, and `Not settings this app reads (a typo?)` listing a deliberately misspelt `badgeColour` and `fontSize2` |
| `config-launcher-chips.png` | An empty cell's launcher showing three settings at once: `cwdPresets` chips (with their directory-colour stripe), `script.json` under OR RUN A SCRIPT, `launchers` under OR LAUNCH |
| `config-custom-themes.png` | The Settings theme picker with four user-defined schemes (Mondrian / Van Gogh (Arles) / Picasso Blue / Matisse) beside the built-in four, with Van Gogh applied |
| `grid-colors.png` | Four projects color-coded via per-dir `.mulmoterminal.json` (Mondrian / Van Gogh / Picasso / Matisse). Real Claude cells in throwaway `/tmp` demo repos on untrusted dirs (so the trust prompt shows, no account/email leaks). |
| `worktree-close-keep.png` | Closing a worktree cell with nothing unsaved — Keep worktree / Remove worktree / Cancel |
| `worktree-close-discard.png` | The same dialog when the worktree has unpushed commits + uncommitted changes — the button becomes `Discard & remove` |
| `v4.2.0-pane-split.png` | The Canvas pane in SPLIT view beside an enlarged terminal — a wide table with its last four columns cut off at the pane's edge |
| `v4.2.0-pane-full.png` | The same table after the pane's expand button — full terminal row, every column visible, cockpit roster unmoved |
| `v4.2.0-done-green.png` | A 3×3 grid holding all three active states at once: five working (blue), two done (green), two waiting (amber) |
| `header-default.png` | A cell header with nothing configured — the one default button (`pick-file`) beside the fixed cell controls |
| `header-custom.png` | The same header width with five configured `buttons` and an `env staging` custom chip |
| `header-before-after.png` | Both of the above side by side — unconfigured cell left, configured right |
| `header-path-menu.png` | The path menu open: Reveal in the file manager / Browse files in the app / New terminal here |
| `header-skill-menu.png` | The Skill dropdown listing the bundled `mulmoterminal-*` skills |
| `header-shell-cell.png` | The command cell a `run: "shell"` button opens, with `yarn test` output and `[finished]` |

The six `header-*.png` were captured for [`../{en,ja}/header.md`](../en/header.md) from a demo
instance on `HOME=/tmp/mt-demo` (`acme-web` / `acme-api`, header config in
`acme-web/.mulmoterminal.json`), at `deviceScaleFactor: 1` because terminals are in frame.
The cells show Claude's folder-trust prompt: the demo `HOME` is not logged in, which is what keeps
any account out of the shot.

**A config button's tooltip cannot be screenshotted.** `label` renders as the browser's native
`title`, which no headless capture includes — so `header-custom.png` deliberately shows the icons
with no text, and the page explains the hover in prose rather than faking a tooltip.

## Not yet captured (need a live Claude/Codex session)

These states need a real agent turn (cost/time) to look right, so they aren't referenced in the guide yet.
Capture from the demo instance while a Claude session runs, then add them:

- The model / context badge (`Opus · ctx 35%`).
- A worktree cell's diff PANEL (the badge itself is in `worktree-close-discard.png` as `+2 ●5`).
- The activity timeline (🕘) modal.
- The estimated-cost block in Settings.
