# Remotion scenes in MulmoCast videos: guide + `init` check (#2904)

mulmocast 2.13.0 adds an image type `remotion`: `claude -p` writes a Remotion component per beat and
mulmocast renders it. Its packages are optional peers of mulmocast, and MulmoTerminal does not
depend on them — users who want it install them.

## The problem

mulmocast's own hint is `npm install …`, with no location. Under `npx mulmoterminal@latest`,
mulmocast lives in `~/.npm/_npx/<hash>/node_modules/`, and the hash changes per release, so an
install there vanishes on the next upgrade.

## Where to install: `~/node_modules`

Node resolves by walking up parent directories, so `~/node_modules` is reached from any npx entry
under the home directory. Verified: with nothing in the npx entry, `npx -p mulmocast@2.13.0 mulmo
images` rendered a `remotion` beat (generate, render, visual review) and the frames matched the
prompt. The generated component's own imports resolve too wherever the script lives: mulmocast
adds remotion's `node_modules` to webpack's `resolve.modules` (`remotionNodeModulesDir` in
`lib/utils/remotion/render.js`).

## Changes

1. `bin/remotion-check.js` — which remotion packages are missing as seen FROM mulmocast's own
   location (the same `createRequire(...).resolve("<name>/package.json")` mulmocast's pre-flight
   does), and the `init` line for it. The package list comes from mulmocast's own
   `mulmocast/remotion` export (2.14.0+); before that export existed it was a pinned copy.
2. `npx mulmoterminal@latest init` prints the line after the PATH tools: `✓`, or `○ optional`
   with what is missing and a link to the guide.
3. README requirements table: an Optional row.
4. New guide page `docs/guide/{en,ja}/mulmocast.md`: install, login and billing (`claude -p` runs
   as the server's own login, not an `accounts` login), first-run Chrome download, a minimal beat,
   where the generated `.tsx` lands, and the trust note.

## Out of scope

- The agent-facing tool description (receptron/mulmoclaude#3379).
- UI for progress / editing the `.tsx` / regenerating one scene.

## Follow-up: `code` scenes and where Chrome lands (#2909)

- mulmocast 2.14.0 renders a remotion beat from `code` (`kind: "path"`, relative to the script, or
  `"text"`) without calling `claude -p`. Checked by rendering a `code` beat with a `claude` on PATH
  that only records being called: it rendered, and nothing was recorded.
- Remotion's `getDownloadsCacheDir` (`@remotion/renderer/dist/browser/get-download-destination.js`)
  walks up from `process.cwd()` to the first `package.json` and uses its `node_modules/.remotion`
  (falling back to `<cwd>/.remotion` when none is found). The server runs with `cwd: PKG_DIR`, so the
  browser lands in MulmoTerminal's install folder, a new folder per version under npx. The guide said
  "once"; it now says the first render after each update downloads it again.
