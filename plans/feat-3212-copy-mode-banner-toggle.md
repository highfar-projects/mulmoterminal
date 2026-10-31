# feat: a switch for the copy-mode banner (#3212)

The "Viewing history" banner covers output while the user scrolls back. Add a per-browser
switch in Settings, under Terminal scroll speed, that hides it.

- Default stays "shown": the banner exists so copy-mode does not read as a dead terminal (#2207),
  so nobody who does not touch the switch sees any difference.
- Stored in localStorage like the scroll speed and return-on-submit switches. Only the exact
  string "0" hides it; anything unreadable keeps the banner.
- Only the render condition in `Terminal.vue` changes. Copy-mode detection, the exit path and
  `q` are untouched.
- Smaller or relocated banners were rejected: they change the default for everyone.
