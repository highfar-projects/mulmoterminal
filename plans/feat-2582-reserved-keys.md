# feat: show browser-reserved keys in the keymap settings (#2582)

`Cmd`/`Ctrl`+`W`, `T`, `N` and `Shift`+`T` never reach the page, so a binding on one looks exactly
like a shortcut that "just does not work"; the only place that said so was the guide's table.

- `common/keymap.ts`: `BROWSER_RESERVED_KEYS` per platform — Cmd on macOS (where Ctrl+W/T/N reach the
  page and work), Ctrl on Windows and Linux — with `reservedPlatformsOf` and `reservedPlatformFor`.
  `validateKeymap` warns (not fatal) per platform, since the server cannot know which browser connects,
  and skips the Cmd-letter lowercase advice for a key the Mac browser keeps anyway.
- Settings → Keyboard shortcuts: for THIS browser's platform, a row bound to one carries a *never
  fires* chip (focusable, the reason as its tip), and a line under the list names that platform's
  reserved keys. Strings in five locales.
- Guides (en/ja) and the keys skill say both.

Not here: the Keyboard Lock "focus mode" (#2580), under which these could be bound.
