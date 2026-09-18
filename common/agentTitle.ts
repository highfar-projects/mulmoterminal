// The cap on what an agent's own store label may be, shipped to the roster.
//
// In `common/` because BOTH sides decide from it: the server cuts the title here, and the client has
// to know that a title of exactly this length may be a TRUNCATION of the prompt beneath it rather
// than the whole of it. Without that, the roster cannot tell "the summary is the entire prompt, cut
// by us" from "the summary is a shorter, different sentence that happens to start the same way", and
// suppressing the second hides a real opening (#2123, Codex round 4).
export const AGENT_TITLE_MAX = 200;
