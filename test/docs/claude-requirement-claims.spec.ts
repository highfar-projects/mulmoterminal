// @vitest-environment node
//
// "Claude Code is required to start" stopped being true (#2082), and the sentence saying so lived in
// TEN places across three files and two languages. Three separate review findings each fixed one
// site; the fourth would have found another, because a claim always has one more phrasing than
// anyone enumerates. The one I missed had no word in common with the nine I found — the Japanese
// row said "the ONLY required check" and its English twin said "the one thing checked at launch".
//
// So this inverts the rule. Instead of listing the BAD sentences — unbounded — it states what is
// PERMITTED: on the setup surfaces, a line may say Claude is needed to start ONLY if it also says
// what changes that. Everything else is reported.
//
// It deliberately rejects some safe prose. A line mentioning Claude and "required" for an unrelated
// reason must carry an escape-hatch word or be allowlisted, and that is the trade: a false positive
// costs one word, and a false negative shipped four times.
//
// WHAT THIS IS NOT: a proof. It is a NET, woven from the vocabulary these claims have actually used,
// plus every near-miss found by attacking it (nine phrasings, both languages, all caught).
//
// The hole it CANNOT close, named because a guard that hides its limit is worse than none:
// **a claim that refers to Claude only by anaphora.** Round 4 of #2084 found
//
//     "**What for:** this is the agent that runs inside every cell. It is the only thing
//      MulmoTerminal refuses to start without."
//
// — false, and the word "Claude" appears nowhere in it; the referent is the section HEADING. No
// lexical rule catches that without flagging most of the guide, which was measured: scanning by
// paragraph instead of by line turned three files into five false positives each. So the sweep
// remains the ceiling and this is a net under it, not a replacement for reading.
//
// SCOPE IS NARROW ON PURPOSE — the two getting-started pages and the README. Policing every mention
// of Claude across the whole guide would be noise, and noise is how a guard stops being read.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const SURFACES = ["README.md", "docs/guide/en/getting-started.md", "docs/guide/ja/getting-started.md"];

const MENTIONS_CLAUDE = /claude/i;

// About STARTING UP specifically. A bare "needs" is not enough — it caught a billing requirement
// ("Claude Code needs a Pro plan") and a sentence about which cell wants your attention, neither of
// which this rule is about.
// Split by language rather than one alternation: the combined form tripped
// `sonarjs/regex-complexity` (21, max 20), and two named halves read better than the one that did
// not. Worth noting HOW that was found — local `yarn lint` passed and CI's `yarn lint:ci` failed,
// because the two use different cache strategies (CLAUDE.md says so; this is what it costs).
const ASSERTS_IN_ENGLISH = /\brequired\b|\brequires\b|\bneeds?\b|must be installed|on your `?PATH|CLI not found|without .*(claude|it)/i;
const ASSERTS_IN_JAPANESE = /必須|必要|起動できません|起動しません|がすでに入っている|無いと|なしでは/;
const assertsAStartupRequirement = (text: string): boolean => ASSERTS_IN_ENGLISH.test(text) || ASSERTS_IN_JAPANESE.test(text);

const NAMES_THE_ESCAPE = /default agent|by default|unless|CLAUDE_BIN|_BIN\b|Starting without|既定エージェント|宣言|なしで起動|そちらのチェック/i;

// Mentions about something else. Kept tiny and specific: an allowlist that grows is the guard being
// negotiated away.
const NOT_ABOUT_STARTUP = [
  /customAgents/, // the `agent: "claude"` schema field
  /claude-ollama/, // that wrapper really does need Claude Code
  /Claude セッション|Claude session/, // naming what a cell runs, not a start-up condition
  /needs you/, // the grid marking which cell wants attention
  /\.claude\//, // a `.claude/…` DIRECTORY, not the CLI
  /\bplan\b|Pro, Max|プラン/, // Claude Code needs a paid PLAN — a real requirement, a different one.
  // `プラン` is here because allowlisting only the English half is the same en/ja drift this guard
  // exists to catch, committed inside the guard itself.
];

// The escape may be on the NEXT line, because prose wraps — a one-line window reported all-clear on
// two sentences whose "unless" sat on the following line.
const LOOKAHEAD = 2;

describe("the setup surfaces never claim Claude Code is unconditionally required", () => {
  it.each(SURFACES)("%s", (relative) => {
    const lines = readFileSync(path.join(REPO, relative), "utf8").split("\n");
    const offenders = lines
      .map((text, i) => ({ text, line: i + 1, window: lines.slice(i, i + 1 + LOOKAHEAD).join(" ") }))
      .filter(({ text }) => MENTIONS_CLAUDE.test(text) && assertsAStartupRequirement(text))
      .filter(({ text }) => !NOT_ABOUT_STARTUP.some((allowed) => allowed.test(text)))
      .filter(({ window }) => !NAMES_THE_ESCAPE.test(window))
      .map(({ line, text }) => `${relative}:${line}  ${text.trim().slice(0, 110)}`);
    expect(offenders.join("\n"), "say what lifts the requirement, or allowlist the line").toBe("");
  });
});
