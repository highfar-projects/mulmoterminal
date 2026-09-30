# feat: run the server on another machine over an SSH tunnel — first cut (#2669)

Minimal version, then feedback from people who use it.

## Verified before writing anything

A `node:22-bookworm` container with sshd, `git`, `gh`, `tmux`, Claude Code and `mulmoterminal@latest`;
only its SSH port published. From the host: `ssh -L 34599:127.0.0.1:34567`, then

- the page loads in a real browser (Playwright), 0 console errors; a Shell cell runs on the
  container (`uname` → Linux aarch64);
- `/ws` spawns a PTY; a shell session reattaches after the WebSocket closes AND after the tunnel
  itself is dropped and reopened;
- a POST with the page's origin passes `sameOriginGuard`, a foreign origin gets 403;
- `claude` with no browser shows its sign-in URL ("Browser didn't open? …") and waits for a code;
- Docker without SSH (`-p 127.0.0.1:34598:34567 -e MULMOTERMINAL_HOST=0.0.0.0`) also runs a shell.

No code change was needed for any of that.

## Change

- `bin/ssh-hint.js`: started inside an SSH login (`SSH_CONNECTION` / `SSH_CLIENT`), the launcher
  opens no browser on that machine and prints the `ssh -N -L` command to run on your own. The host
  is left as `<this-host>`: `SSH_CONNECTION` names the address the server side answered on, which
  behind NAT or a container is not one the laptop can reach.
- Guide page `docs/guide/{en,ja}/remote.md`; FAQ and README link to it.

## Left for feedback

A "server is remote" setting that hides the actions acting on the server's machine, an official
image, Codex login on a headless box, the `dev:server` / `dev:client` split.
