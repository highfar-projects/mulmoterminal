// @vitest-environment node
// Prose that COUNTS or ENUMERATES the hosted agents, checked against the typed list.
//
// WHY THIS IS A TEST AND NOT ANOTHER ROUND OF PROOFREADING. Adding cursor produced the same finding
// three times in one review loop — the README's count, then six counts in the matrix's prose, then
// five more across the README, a component comment, a shared type's comment and a spec's own
// docblock. Each fix was correct and each round found new instances, because a sentence counting
// the agents can be written anywhere and nothing was checking. The rule that ends that is not a
// longer list of bad sentences; it is a rule about what is PERMITTED, failing closed so the EIGHTH
// agent turns this red instead of being found by a reviewer three rounds in.
//
// WHAT IT DELIBERATELY DOES NOT CHECK, because a regex over prose cannot say it precisely:
//
//   - A BARE "N agents". "one agent, then a grid of them" and "you don't need ten agents" are both
//     in the README and neither is a claim about the size of the set. Only the phrasings that name
//     THIS set are checked, and they are listed below — which does mean a new way of writing the
//     count can still go stale once. Once, not three times.
//   - AN ENUMERATION that omits an agent. It was measured before being rejected: a rule of "a line
//     naming four or more agents must name them all" flags twelve lines in these three files today
//     and eleven are legitimate subsets — the matrix's own table rows, mostly. A guard with that
//     ratio gets weakened until it matches nothing, and then it reads as coverage. The picker's
//     enumeration below is the one exception: it is a fixed list a user sees, and it is the one
//     that actually went stale twice.
//
// HISTORICAL PAGES ARE OUT OF SCOPE on purpose: `docs/ChangeLog.md` and the dated
// `docs/guide/*/v*.md` snapshots are records of what was true on a date, and this repo's own rule
// is never to edit an old one to match new behaviour.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { TERMINAL_AGENTS } from "../../../common/sessionAgent.js";
import { LAUNCH_AGENTS } from "../../../common/launchAgent.js";
import { AGENT_SESSION_LIST_PATHS } from "../../../common/agentSessionList.js";
import { getAgentAdapter } from "../../../server/agents/registry.js";
import { agentBadge } from "../../../common/sessionAgent.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

/** The living inventories — the ones README and CLAUDE.md point at as current. */
const SURFACES = ["README.md", "CLAUDE.md", "docs/agent-capability-matrix.md", "docs/guide/en/agents.md"];

/** The picker check is about a PROSE enumeration and is asked of fewer files than the count is.
 *  The guide expresses the same list as a TABLE whose header cell is "Agent Picker", and a window
 *  into a table sees its first rows and reports the rest as missing — three false positives when
 *  it was tried. The guide's version of this claim is covered by the badge and name checks below,
 *  which do not care how the page is laid out. */
const PICKER_SURFACES = ["README.md", "CLAUDE.md", "docs/agent-capability-matrix.md"];

const NUMBER_WORDS = ["one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];
/** Digits too. Codex's round-5 follow-up: the docs spell numbers out today, so a future `7 adapters`
 *  would have walked past a words-only guard — which is the same "one more way to say it" this test
 *  exists to stop. */
const NUMBERS = [...NUMBER_WORDS, ...NUMBER_WORDS.map((_, i) => String(i + 1))];
const numberOf = (token: string): number => (/^\d+$/.test(token) ? Number(token) : NUMBER_WORDS.indexOf(token.toLowerCase()) + 1);

/** The noun phrases that can only mean THIS set. Bare "agents" is deliberately absent — see the
 *  header. These are the shapes the three rounds of findings actually took. */
const SET_NOUNS = ["adapters?", "built-in agents?", "built-ins?", "hosted agents?", "current agents?", "agent CLIs?"];

/** Two shapes, because the number that has to be right sits in a different place in each.
 *  "seven adapters", "the six built-ins" — the count leads. */
const COUNT_LEADS = new RegExp(String.raw`\b(${NUMBERS.join("|")})\s+(?:${SET_NOUNS.join("|")})`, "gi");
/** "three of the seven agents" — here "three" is a SUBSET and says nothing about the set; the
 *  number that must be right is the one after "of". "out of" and a bare "of seven agents" are the
 *  two variants Codex named in round 5, and they are here for the reason digits are. */
const COUNT_TRAILS = new RegExp(String.raw`\b(?:out\s+)?of\s+(?:the\s+)?(${NUMBERS.join("|")})\s+agents?\b`, "gi");

const linesOf = (file: string): string[] => readFileSync(path.join(repoRoot, file), "utf8").split("\n");

describe("prose that counts the hosted agents", () => {
  it.each(SURFACES)("%s never names a count other than the real one", (file) => {
    const expected = NUMBER_WORDS[TERMINAL_AGENTS.length - 1];
    const wrong = linesOf(file).flatMap((line, i) =>
      [...line.matchAll(COUNT_LEADS), ...line.matchAll(COUNT_TRAILS)]
        .filter((m) => numberOf(m[1]) !== TERMINAL_AGENTS.length)
        .map((m) => `${file}:${i + 1} says "${m[0]}" — there are ${TERMINAL_AGENTS.length} (${expected})`),
    );
    expect(wrong).toEqual([]);
  });
});

describe("the Agent Picker's own enumeration", () => {
  // The one list that is spelled out rather than derived, because it describes what a user sees.
  // It went stale for copilot and again for cursor.
  //
  // Over the file with newlines collapsed, NOT line by line: the README wraps this enumeration
  // across two lines, so a line-based check sees "Agent Picker" on one and the names on the next
  // and passes whatever is missing. That was caught by break-verifying this guard against the very
  // mistake it exists for, which a line-based version did not catch.
  const WINDOW = 320;
  // Any mention of the picker, not the exact string "Agent Picker": Codex's round-5 follow-up named
  // a list written under "the agent picker" or "the picker" as the most plausible way past this,
  // and it is more likely than someone inventing a new count phrasing.
  const PICKER_CUE = /agent picker|\bpicker\b/gi;
  it.each(PICKER_SURFACES)("%s lists every launchable agent wherever it spells the picker out", (file) => {
    const text = readFileSync(path.join(repoRoot, file), "utf8");
    const flat = text.replace(/\n/g, " ");
    const missing: string[] = [];
    for (const match of flat.matchAll(PICKER_CUE)) {
      const window = flat.slice(match.index, match.index + WINDOW);
      const named = LAUNCH_AGENTS.filter((agent) => new RegExp(String.raw`\b${agent}\b`, "i").test(window));
      // Fewer than three names is prose ABOUT the picker, not an enumeration OF it.
      if (named.length < 3) continue;
      const absent = LAUNCH_AGENTS.filter((agent) => !named.includes(agent));
      if (absent.length === 0) continue;
      const line = text.slice(0, match.index).split("\n").length;
      missing.push(`${file}:~${line} enumerates the picker but omits ${absent.join(", ")}`);
    }
    expect(missing).toEqual([]);
  });
});

// The REFERENCE surfaces, which drift a different way from the prose: a table that lists one row
// per agent simply stops before the newest one. Round 6 of #2065 found four of these at once — the
// env-var table, two endpoint lists, and the bilingual guide, some of which had also been missed
// when copilot landed. Unlike the prose rules above these are exactly derivable, so there is no
// judgement in them and no false-positive rate to trade against.
describe("reference tables list every agent", () => {
  const readme = () => readFileSync(path.join(repoRoot, "README.md"), "utf8");

  it("README documents every agent's binary override", () => {
    const missing = TERMINAL_AGENTS.filter((agent) => !readme().includes(getAgentAdapter(agent).binEnvVar));
    expect(missing).toEqual([]);
  });

  it("README documents every agent's conversation-list endpoint", () => {
    const text = readme();
    const missing = TERMINAL_AGENTS.filter((agent) => !text.includes(AGENT_SESSION_LIST_PATHS[agent]));
    expect(missing).toEqual([]);
  });

  // The guide is bilingual and this repo's rule is to keep the two in step; a page that names five
  // agents when seven ship is the front door telling users the wrong thing.
  it.each(["docs/guide/en/agents.md", "docs/guide/ja/agents.md"])("%s names every agent", (file) => {
    const text = readFileSync(path.join(repoRoot, file), "utf8");
    const missing = TERMINAL_AGENTS.filter((agent) => !new RegExp(String.raw`\b${agent}\b`, "i").test(text));
    expect(missing).toEqual([]);
  });
});

// The GUIDE drifts a third way, and round 7 of #2065 is where that became clear: the checks above
// require every agent to be NAMED, and a page can name all seven while still telling the reader
// there are five of them, listing four badges, and saying "these two" under a heading that names
// three. Codex was asked whether the guard would have caught its round-7 finding; it said no and
// named the gap, which is the more valuable half of that round.
describe("the guide agrees with the code about the agent set", () => {
  const guide = (file: string): string => readFileSync(path.join(repoRoot, file), "utf8");

  /** The badge SECTION, not the whole page: every short code also appears in the at-a-glance table,
   *  so a whole-file check is green while the prose list beside it is missing one — which is the
   *  exact shape round 7 found. Scoped from the badges heading to the next one. */
  const badgeSection = (file: string): string => {
    const text = guide(file);
    const heading = /^## (?:The header badges|ヘッダーのバッジ)/m.exec(text);
    if (!heading) throw new Error(`${file} has no badges section — the heading was renamed, so this check is not asking what it thinks`);
    const rest = text.slice(heading.index + heading[0].length);
    const next = /^## /m.exec(rest);
    return next ? rest.slice(0, next.index) : rest;
  };

  it.each(["docs/guide/en/agents.md", "docs/guide/ja/agents.md"])("%s lists every badge where it lists badges", (file) => {
    const section = badgeSection(file);
    // Claude has no badge on purpose — it is the default, so badging it would put one on nearly
    // every row. `agentBadge` returns null for it, which is the same answer as "not an agent".
    const missing = TERMINAL_AGENTS.filter((agent) => {
      const badge = agentBadge(agent);
      return badge !== null && !section.includes(`\`${badge.short}\``);
    });
    expect(missing).toEqual([]);
  });

  // Japanese has no counter shape a general rule can express, so these are the two forms the page
  // actually uses. Said out loud because it IS an enumeration of forms — the thing this file
  // otherwise avoids — and a third form would walk past it once.
  const JA_COUNTS = [/(\d{1,2})つのエージェント/g, /エージェントは(\d{1,2})つ/g];
  it("docs/guide/ja/agents.md counts the agents correctly", () => {
    const text = guide("docs/guide/ja/agents.md");
    const wrong = JA_COUNTS.flatMap((re) => [...text.matchAll(re)])
      .filter((m) => Number(m[1]) !== TERMINAL_AGENTS.length)
      .map((m) => `says "${m[0]}" — there are ${TERMINAL_AGENTS.length}`);
    expect(wrong).toEqual([]);
  });
});
