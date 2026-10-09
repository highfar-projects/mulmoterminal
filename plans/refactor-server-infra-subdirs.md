# refactor: group server/infra into subdirectories (#2961)

Last of a series after `server/agents` (#2944), `server/config` (#2946), `server/backends` (#2952) and
`server/session` (#2956). Same method: files are moved with `git mv`, never renamed; only import
specifiers and path mentions change.

## Layout

- `process/` — running other programs: process list and tree, spawn capture and cwd, PTY env, binary
  lookup, command escaping and quoting, machine load, tmux, shutdown, server exit, GUI MCP registration.
- `http/` — listening and origin rules: loopback, allowed origin, the listening announcement, SPA
  fallback, error-stack hiding, web push, the switch-token routes.
- `fs/` — paths and files: canonical path, containment, symlink guard, jsonl and text reads, state and
  home roots, project root, workspace key, bundled-skill install, legacy cleanup.
- `tools/` — server-side tool registration: the host tools, collection tools, the shapescript tools,
  shared-app tools, the plugin registry and runtime.
- `async/` — pubsub, bounded concurrency, per-key serialisation, coalescing.

`fs` and `process` import each other at directory level, one file each way. It is not a file-level cycle.

## The deliberate exceptions to "files are not edited"

Two files and three tests build a path from their own location, which the type checker cannot see, so
each got one more `..`: `fs/install-bundled-skills.ts` (the bundled `skills/` dir), `tools/plugins-registry.ts`
(the package-root `plugins/` dir), and the specs `loopback-curl-proxy`, `server-exit`, `tmux`. One more spec,
`test/bin/probe-bind-host.spec.ts`, names a moved source file as separate path segments.

## Verification

`yarn typecheck`, `yarn lint`, `yarn build`, `yarn test`, a server boot, and the PTY smoke test.
