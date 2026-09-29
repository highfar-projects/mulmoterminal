# feat: show browser-reserved keys in the keymap settings (#2582)

`Cmd`/`Ctrl`+`W`, `T`, `N` and `Shift`+`T` never reach the page, so a binding on one looks exactly
like a shortcut that "just does not work"; the only place that said so was the guide's table.

- `common/keymap.ts`: `BROWSER_RESERVED_KEYS` (the guide's table as data), `isBrowserReserved`,
  `bindsBrowserReservedKey`. `validateKeymap` warns (not fatal) for an action with such a keystroke,
  naming the way out (`"Cmd+K w"`).
- Settings → Keyboard shortcuts: a row bound to one carries a *never fires* chip with the reason as its
  tip, and a line under the list names the reserved keys. Strings in five locales.
- Guides (en/ja) and the keys skill say both.

Not here: the Keyboard Lock "focus mode" (#2580), under which these could be bound.
