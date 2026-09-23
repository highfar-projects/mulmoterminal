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
import { parseAgentArg } from "../../bin/default-agent.js";
import { isTerminalAgent, type TerminalAgent } from "../../common/sessionAgent.js";

/** `null` for absent or unknown, so the caller falls through to the config file and then to claude.
 *
 *  The FLAG ITSELF is read by the launcher's own parser rather than by a second one written here.
 *  The launcher accepts `--agent=codex` as well as `--agent codex`, and a private copy of the rule
 *  accepted only the second — which the normal path hides, because the launcher always re-emits the
 *  spaced form. The gap is the hand-run server (`yarn dev --agent=codex`), the one case this
 *  function exists for, where the flag was dropped without even a warning. */
export const agentFromArgv = (argv: readonly string[]): TerminalAgent | null => {
  const declared = parseAgentArg(argv);
  return declared !== null && isTerminalAgent(declared) ? declared : null;
};

/** Whether an `--agent` was written at all, in either form. Lets an unusable one be reported rather
 *  than silently ignored — `parseAgentArg` answers null only when the flag is absent. */
export const declaresAgent = (argv: readonly string[]): boolean => parseAgentArg(argv) !== null;
