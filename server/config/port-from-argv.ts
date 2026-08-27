// The port the LAUNCHER chose, handed over on the command line rather than in the environment.
//
// Its own module, and pure, because the alternative is a decision that can only be checked by
// starting a process on a port.
//
// Why argv at all: the server hands its own environment to every PTY it spawns, so a port put
// there reaches every terminal in every cell — a raw `PORT` made a dev server started in a cell
// try to take MulmoTerminal's own port (#1857). `MULMOTERMINAL_PORT` cannot stand in for it
// either: that one is deliberately given to PTYs (server/session/mcp-config.ts) so the MCP URLs
// and the bundled skills can find the server, so reading it here would clash with ourselves the
// moment `yarn dev` ran inside a cell. argv is not inherited, so it has no such reach.

const MAX_PORT = 65535;

/** `null` for absent or unusable, so the caller falls through to `PORT` and then the default.
 *  The launcher validates before it spawns (bin/cli-args.js), so this only has to refuse what
 *  a hand-run `--port` could carry. */
export const portFromArgv = (argv: readonly string[]): number | null => {
  const at = argv.indexOf("--port");
  if (at === -1) return null;
  const raw = argv[at + 1];
  const parsed = Number.parseInt(raw ?? "", 10);
  if (!Number.isInteger(parsed) || String(parsed) !== raw || parsed < 1 || parsed > MAX_PORT) return null;
  return parsed;
};
