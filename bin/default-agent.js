// Which agent the CLI is being asked to treat as the default, and what the start-up gate must
// therefore check. Pure — no PATH lookup, no filesystem — so every combination is testable
// without a machine that has or lacks a given CLI.
//
// THE RULE (issue #2082): Claude Code stays REQUIRED while nothing is declared, because that is the
// setup the overwhelming majority of users have and a silent fallback would leave them wondering
// which agent they are talking to. Declare a default and the gate follows the declaration instead:
// it stops asking about claude entirely and asks about the agent that was named.
//
// WHAT THIS IS NOT: it does not decide what an EXISTING cell runs. On disk and on the wire, an
// absent `agent` field means claude (src/components/gridTabs.ts says so), and that is a storage
// format rather than a preference — repointing it at this setting would silently re-launch every
// saved Claude cell as something else. This value is read when a NEW session starts, and nowhere
// in the path that restores an old one.
import { AGENT_BIN_SPEC, AGENT_INSTALL_HINT } from "./agent-bins.js";
import { agentInstallGuide } from "./agent-install-guides.js";

export const isKnownAgent = (value) => typeof value === "string" && Object.prototype.hasOwnProperty.call(AGENT_BIN_SPEC, value);

/** `--agent <name>`, or `--agent=<name>`. Returns the raw token so the caller can reject an unknown
 *  one by name rather than silently ignoring a typo. `null` when the flag is absent; `""` when it
 *  is present with nothing after it, which is a usage error rather than "no preference". */
export function parseAgentArg(args) {
  const joined = args.find((a) => a.startsWith("--agent="));
  if (joined !== undefined) return joined.slice("--agent=".length);
  const i = args.indexOf("--agent");
  if (i === -1) return null;
  return args[i + 1] !== undefined && !args[i + 1].startsWith("-") ? args[i + 1] : "";
}

/**
 * The declared default agent, or null when nothing declares one.
 *
 * Two channels only — the flag and the config file — and the flag wins, which is the ordinary
 * shape: the most local statement of intent beats the most durable one.
 *
 * Deliberately NOT a third, environment channel. The launcher hands its own environment to the
 * server, which hands it to every PTY it spawns, so a variable added here reaches every terminal in
 * every cell — the shape of #955 (NODE_ENV) and #1857 (PORT). `--port` was moved OUT of the
 * environment for that reason (server/config/port-from-argv.ts), and this follows it.
 */
export function resolveDeclaredAgent({ cliAgent = null, configAgent = null } = {}) {
  const declared = cliAgent ?? configAgent ?? null;
  return declared === null || declared === undefined || declared === "" ? null : declared;
}

/**
 * What the start-up gate should require, given the declaration.
 *
 * `{ agent, required }` — WHICH agent's binary to look for, and whether a miss stops start-up.
 * A declared agent is required for the same reason claude was: the user named it, so a machine
 * without it cannot do what they asked, and saying so beats an empty grid (issue #2082, decision 1).
 */
export function gateFor(declaredAgent) {
  return declaredAgent === null ? { agent: "claude", required: true, declared: false } : { agent: declaredAgent, required: true, declared: true };
}

/** `defaultAgent` out of a parsed `~/.mulmoterminal/config.json`, or null. Pure: the caller owns the
 *  read and the JSON parse, because a config this CLI cannot read must not stop it starting. An
 *  unknown name is returned as-is so the caller reports the typo rather than ignoring it. */
export function configuredDefaultAgent(parsedConfig) {
  if (parsedConfig === null || typeof parsedConfig !== "object" || Array.isArray(parsedConfig)) return null;
  const value = Object.prototype.hasOwnProperty.call(parsedConfig, "defaultAgent") ? parsedConfig.defaultAgent : null;
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

// The SECTION, not the guide index: someone reading this message is stuck on exactly one question,
// and a link to the front page makes them hunt for the answer they were sent to find.
const GUIDE = {
  en: "https://receptron.github.io/mulmoterminal/guide/en/agents.html#default-agent",
  ja: "https://receptron.github.io/mulmoterminal/guide/ja/agents.html#default-agent",
};

/**
 * What to print when the gate's agent is not installed.
 *
 * Short on purpose. The rule here surprises people — Claude Code is required, and yet the app hosts
 * seven agents — so the message has to answer "why me?" and "what do I type?" in the terminal, and
 * send the rest to the guide. Everything longer than this belongs on that page (issue #2082).
 */
export function missingAgentMessage(gate, bin) {
  const lines = [];
  if (gate.declared) {
    lines.push(`${gate.agent} is set as the default agent, but its command "${bin}" was not found.`);
    lines.push(`Install it and make sure "${bin}" is on PATH, or set ${AGENT_BIN_SPEC[gate.agent]?.env ?? "the agent's *_BIN"} to its full path.`);
  } else {
    lines.push(`Claude Code CLI not found (looked for "${bin}").`);
    const hint = AGENT_INSTALL_HINT.claude;
    lines.push(`Install it:  ${hint}`);
    lines.push("");
    lines.push("Or, if you use a different agent, declare it and this check is skipped:");
    lines.push("  npx mulmoterminal --agent codex");
    lines.push('  ~/.mulmoterminal/config.json:  { "defaultAgent": "codex" }');
    lines.push(`  agents: ${Object.keys(AGENT_BIN_SPEC).join(", ")}`);
  }
  // The maker's own install page (#2230), from the same table the Agent Picker links to — so the
  // terminal and the browser cannot send someone to two different places for one missing agent.
  const install = agentInstallGuide(gate.agent);
  if (install) lines.push(`Install guide:  ${install}`);
  lines.push("");
  lines.push(`Details:  ${GUIDE.en}`);
  lines.push(`日本語:    ${GUIDE.ja}`);
  return lines;
}
