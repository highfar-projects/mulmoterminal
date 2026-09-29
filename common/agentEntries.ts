import { CUSTOM_AGENT_COMMAND_MAX, CUSTOM_AGENT_LABEL_MAX, CUSTOM_AGENTS_MAX, isCustomAgentId, type CustomAgent } from "./customAgents.js";
import { ACCOUNT_HOME_MAX, ACCOUNT_LABEL_MAX, ACCOUNTS_MAX, isAccountHome, isAccountId, type AccountAgent, type AgentAccount } from "./agentAccounts.js";

// Turning what someone typed in Settings into a custom-agent or account entry the server keeps.
//
// The id is DERIVED from the label rather than asked for: it is a slug nobody sees, and a field for
// it is one more thing to get wrong. It is fixed once the entry exists — a session is remembered by
// it, so renaming it later would be a different agent or account. That is why the list offers
// remove and add, and no edit.
const ID_MAX = 32;
const SLUG_CHARS = new Set("abcdefghijklmnopqrstuvwxyz0123456789_-");
const isAlnum = (char: string): boolean => SLUG_CHARS.has(char) && char !== "_" && char !== "-";

/** `label` as a slug: lowercase, one `-` for each run of anything else, starting with a letter or
 *  digit. A label with no Latin letters or digits at all ("仕事") gives "". */
export function slugFromLabel(label: string): string {
  const mapped = [...label.trim().toLowerCase()].map((char) => (SLUG_CHARS.has(char) ? char : "-"));
  const collapsed = mapped.filter((char, i) => char !== "-" || mapped[i - 1] !== "-").join("");
  const start = [...collapsed].findIndex(isAlnum);
  if (start === -1) return "";
  const trimmed = collapsed.slice(start, start + ID_MAX);
  return trimmed.endsWith("-") ? trimmed.slice(0, -1) : trimmed;
}

/** The first of `base`, `base-2`, `base-3`, … that `isFree` accepts, each cut to fit 32 characters. */
export function uniqueSlug(base: string, isFree: (id: string) => boolean, tries: number): string | null {
  const candidates = Array.from({ length: tries }, (_, i) => {
    if (i === 0) return base;
    const suffix = `-${i + 1}`;
    return `${base.slice(0, ID_MAX - suffix.length)}${suffix}`;
  });
  return candidates.find(isFree) ?? null;
}

export const ENTRY_PROBLEMS = ["label", "command", "home", "full"] as const;
export type EntryProblem = (typeof ENTRY_PROBLEMS)[number];
export const isEntryProblem = (value: unknown): value is EntryProblem => ENTRY_PROBLEMS.some((problem) => problem === value);
type Built<T> = { entry: T } | { problem: EntryProblem };

// The id falls back to a generic word when the label gives none, so a Japanese label still works.
function freeId(label: string, fallback: string, isFree: (id: string) => boolean, taken: number): string | null {
  return uniqueSlug(slugFromLabel(label) || fallback, isFree, taken + 2);
}

export function buildCustomAgent(label: string, command: string, existing: readonly CustomAgent[]): Built<CustomAgent> {
  const cleanLabel = label.trim();
  const cleanCommand = command.trim();
  if (existing.length >= CUSTOM_AGENTS_MAX) return { problem: "full" };
  if (!cleanLabel || cleanLabel.length > CUSTOM_AGENT_LABEL_MAX) return { problem: "label" };
  if (!cleanCommand || cleanCommand.length > CUSTOM_AGENT_COMMAND_MAX) return { problem: "command" };
  const id = freeId(cleanLabel, "agent", (candidate) => isCustomAgentId(candidate) && !existing.some((entry) => entry.id === candidate), existing.length);
  return id === null ? { problem: "label" } : { entry: { id, label: cleanLabel, agent: "claude", command: cleanCommand } };
}

export function buildAccount(label: string, agent: AccountAgent, home: string, existing: readonly AgentAccount[]): Built<AgentAccount> {
  const cleanLabel = label.trim();
  const cleanHome = home.trim();
  if (existing.length >= ACCOUNTS_MAX) return { problem: "full" };
  if (!cleanLabel || cleanLabel.length > ACCOUNT_LABEL_MAX) return { problem: "label" };
  if (!isAccountHome(cleanHome) || cleanHome.length > ACCOUNT_HOME_MAX) return { problem: "home" };
  const id = freeId(cleanLabel, "account", (candidate) => isAccountId(candidate) && !existing.some((entry) => entry.id === candidate), existing.length);
  return id === null ? { problem: "label" } : { entry: { id, label: cleanLabel, agent, home: cleanHome } };
}
