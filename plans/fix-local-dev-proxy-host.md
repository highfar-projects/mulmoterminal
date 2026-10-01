# A local app refuses every change in yarn dev, because Vite's proxy rewrites the Host (#2831)

The API refuses a POST/PUT/PATCH/DELETE whose `Origin` is not its own `Host` (skills/api, skills/security). Under
`yarn dev` the browser's Origin is the Vite port, and Vite forwards `/api` to the server. A proxy written as a plain
string makes Vite add `changeOrigin: true`, which rewrites the Host to the server's port, so every change made in
development is refused as cross-site. The scaffold never said how to write the proxy, and every check runs the BUILT
server on one port, so all steps passed and only `yarn dev` was broken.

- `skills/scaffold` says to write the proxy as `{ target, changeOrigin: false }`, and why.
- `checks/dev-proxy.mjs` loads the app's Vite config through the app's own Vite (`loadConfigFromFile`, as `yarn dev`
  does, so env and function configs are evaluated rather than read as text) and holds `server.proxy` to
  `devProxyRules.mjs`: a string entry, or `changeOrigin: true`, is named with the fix. The scaffold check and the
  run-check (`smoke.sh`) run it, so a later step that rewrites `vite.config` is caught too.
- The guard is not loosened: with the Host kept, a cross-site change through the dev server is still refused.

Reproduced on a generated app: through Vite, a same-origin POST got 403; after the fix it got 201 (also from the real
screen in a browser), and a POST with a foreign Origin still got 403.
