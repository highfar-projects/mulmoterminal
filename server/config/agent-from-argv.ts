// The default agent the LAUNCHER was told about, handed over on the command line rather than in the
// environment.
//
// Its own module, and pure, for port-from-argv.ts's reasons — both the testability one and the
// hazard one: the server hands its own environment to every PTY it spawns, so a preference put
// there reaches every terminal in every cell (#955, #1857). argv is not inherited.
//
// This is the DECLARATION, not the answer to "what does this cell run". An absent `agent` on a
// stored cell still means claude and always will (src/components/gridTabs.ts) — that is a storage
// format. This only seeds what a NEW session starts as.
import { isTerminalAgent, type TerminalAgent } from "../../common/sessionAgent.js";

/** `null` for absent or unknown, so the caller falls through to the config file and then to claude.
 *  The launcher validates before it spawns (bin/default-agent.js), so this only has to refuse what
 *  a hand-run `--agent` could carry. */
export const agentFromArgv = (argv: readonly string[]): TerminalAgent | null => {
  const at = argv.indexOf("--agent");
  if (at === -1) return null;
  const raw = argv[at + 1];
  return raw !== undefined && isTerminalAgent(raw) ? raw : null;
};
