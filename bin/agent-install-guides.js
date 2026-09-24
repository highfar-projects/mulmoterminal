// Where each hosted agent's OFFICIAL install guide lives (#2230). The URLs themselves are data, in
// agent-install-guides.json beside this file — edit that, not this.
//
// Links only, never install commands, for agent-bins.js's reason: a wrong command is the one thing
// a stuck user will paste. Each entry is a page on the maker's own domain that gives the install
// steps for the command this app runs; `checked` is the date someone last opened it and confirmed
// that. An agent whose page cannot be confirmed is left OUT rather than guessed — its readers get
// no link, which is better than a wrong one.
//
// Here in bin/ because the CLI's missing-agent message runs before tsx exists; the server imports
// it from here (as it does agent-bins.js), and the browser reads it off /api/agents/availability.
import { createRequire } from "node:module";

const GUIDES = createRequire(import.meta.url)("./agent-install-guides.json");

/** The install guide for `agent`, or null when none is recorded. */
export function agentInstallGuide(agent) {
  const entry = Object.prototype.hasOwnProperty.call(GUIDES, agent) ? GUIDES[agent] : null;
  return entry !== null && typeof entry === "object" && typeof entry.url === "string" ? entry.url : null;
}

/** The raw table, for the spec that checks every entry's shape. */
export const AGENT_INSTALL_GUIDES = GUIDES;
