// The cap on what an agent's own store label may be, shipped to the roster.
//
// In `common/` because BOTH sides decide from it: the server cuts the title here, and the client has
// to know that a title of exactly this length may be a TRUNCATION of the prompt beneath it rather
// than the whole of it. Without that, the roster cannot tell "the summary is the entire prompt, cut
// by us" from "the summary is a shorter, different sentence that happens to start the same way", and
// suppressing the second hides a real opening (#2123, Codex round 4).
export const AGENT_TITLE_MAX = 200;

/** What an `agentTitle` IS, which the roster cannot work out from the string itself.
 *
 *  Four agents answer with the person's OPENING PROMPT; two answer with a summary the agent wrote
 *  for itself. The difference decides whether a title that is exactly `AGENT_TITLE_MAX` long may be
 *  treated as our own truncation of the prompt beneath it — for an opening prompt it is, for an
 *  agent's own summary it may simply be a long sentence that happens to start the same way.
 *
 *  Sent per response rather than derived on the client, so the two cannot drift: the server states
 *  what it just read. */
export type AgentTitleKind = "opening-prompt" | "agent-summary";

/** Which kind each agent's store answers with. copilot and muse write their own summary — and are
 *  also the two the reader never caches, because they REWRITE it as the conversation goes. */
export const agentTitleKind = (agent: string): AgentTitleKind => (agent === "copilot" || agent === "muse" ? "agent-summary" : "opening-prompt");
