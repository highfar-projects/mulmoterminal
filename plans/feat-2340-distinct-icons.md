# feat: one glyph, one meaning (#2340)

From #2311: the same Material Symbols glyph meant two different things in the UI.

| Control | Was | Now | Why |
|---|---|---|---|
| Cell close (header button, roster row menu's Close) | `close` | `power_settings_new` | Ends the session; `close` also meant "hide this pane" |
| Side pane hide (Canvas, Tools, Prompts, Transcript, Collections, Question, Files) | `close` | `right_panel_close` | Only hides the pane; the session keeps running |
| Attention sound toggle (on / off / blocked) | `notifications_active` / `_off` / `_paused` | `volume_up` / `volume_off` / `volume_mute` | The bell is the notifications dropdown; the toggle is about sound |
| Sort mode "manual" | `swap_horiz` | `reorder` | `swap_horiz` is the talk menu's "exchange one turn" |

Out of scope: every other `close` (dismiss buttons, notifications, dialogs, overlays, command
palette, launch form) and the talk menu's `swap_horiz`, which keep their glyphs.

Each changed glyph is pinned by a spec that mounts the control (or calls its state function), so
reverting one goes red.
