# Your own pictures and videos for playfulEffects (#3073)

## What the user asked for

- Users want their own animated GIFs and videos behind a busy terminal, picked at random alongside
  the built-in pictures.
- Files are local, given as an absolute path, `~/` (home) or `./` (the directory MulmoTerminal was
  started in).
- Set in `~/.mulmoterminal/config.json`. Hidden: no control in Settings.
- The user guide comes first, and the implementation follows it.

Decisions from the questions asked up front:

- One file per entry, used at every level, plus an optional finale file.
- The built-in nine plus the user's files; `"builtIn": false` leaves the nine out.
- The guide is a page in the public guide (`docs/guide/{en,ja}/playful-media.md`), not linked from
  Settings or the feature list.
- Videos are always muted and looping. Size limits: images 20 MB, videos 50 MB.

## Shape

- `common/playfulMedia.ts`:
  - the config key's sanitizer (`playfulMedia: { builtIn, files: [path | {file, finale}] }`);
  - the extension → kind/MIME map and the size limits;
  - the wire shape and the browser's boundary check (only URLs under `/api/playful-media/`);
  - `heatPickFor`, the pick per session. With no files of the user's it gives every session the
    picture `patternFor` always did. Under reduced motion it leaves the user's files out, since a
    browser cannot hold a GIF still.
- `server/config/playful-media.ts`, pure over an injected `stat`:
  - path resolution;
  - the per-file check (type, exists, is a file, size);
  - the catalog with one warning per file left out;
  - the public list, by index and with an mtime version, never a path.
- `server/routes/playful-media-routes.ts`:
  - `GET /api/playful-media` returns the list;
  - `/:index` and `/:index/finale` serve the file with our own type, `nosniff` and `sandbox`, the
    way the directory images are served. The config is the allowlist.
- `--launch-dir` on the server's argv: the launcher spawns the server in the package directory, so
  `./` needs the user's directory. It is passed in argv rather than the environment, for `--port`'s
  reason: the environment reaches every PTY.
- The browser:
  - reads the list on every config load, newest read wins;
  - `CpuHeatOverlay` draws `HeatMedia` (an `<img>` or a muted `<video>`) in the built-in stage's
    place, with the same per-level opacity (`STAGE_OPACITY`) and the same shake at level 4;
  - a file of the user's is not restarted between levels;
  - without a finale file, the overlay just goes at the finale.

## Out of scope

- A Settings control (hidden by request).
- Choosing one of the user's files by name in `playfulEffects`.
- Per-level files.
