# feat: #2669 follow-ups — a Settings box for remoteServer, verified logins, an example image

What could be done without the people who use it (the rest waits for their feedback).

## Change

- **Settings switch**: an "Experimental: the server runs on another machine" box under Settings →
  Sessions and background tasks, saved like the other global flags (`createGlobalFlag.save`); a
  refused save puts the box back. It applies at once in the page; the launcher reads it at its next
  start. `settings-coverage` now records a UI control for `remoteServer`.
- **Codex on a headless box**: observed in a Linux container — `codex` offers "Sign in with Device
  Code": `https://auth.openai.com/codex/device` + a one-time code (15 minutes). The guide says so.
- **`dev:server` / `dev:client` split**: run apart locally — Vite's proxy carried `/api` and a shell
  WebSocket to the separately started server. The guide drops "not tried" and names `PORT=`.
- **Example Dockerfile** in the guide (Node 22, git, gh, tmux, Claude Code, a `dev` user,
  `MULMOTERMINAL_HOST=0.0.0.0`): built and run published on `127.0.0.1`; a shell in it ran as `dev`
  with `gh` present. Still no official image.

## Still open

Completing a Claude sign-in on a remote box (needs an account); an official image.
