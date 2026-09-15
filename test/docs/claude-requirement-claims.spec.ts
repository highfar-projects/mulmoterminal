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
const ASSERTS_A_STARTUP_REQUIREMENT =
  /\brequired\b|\brequires\b|must be installed|on your `?PATH|CLI not found|必須|起動できません|起動しません|がすでに入っている/i;

const NAMES_THE_ESCAPE = /default agent|by default|unless|CLAUDE_BIN|_BIN\b|Starting without|既定エージェント|宣言|なしで起動|そちらのチェック/i;

// Mentions about something else. Kept tiny and specific: an allowlist that grows is the guard being
// negotiated away.
const NOT_ABOUT_STARTUP = [/customAgents/, /claude-ollama/, /Claude セッション/, /Claude session/];

// The escape may be on the NEXT line: prose wraps, and a one-line window is the boundary that made
// three of these sweeps report all-clear while a wrapped sentence sat there. Two lines of lookahead
// covers every wrap in these files.
const LOOKAHEAD = 2;

describe("the setup surfaces never claim Claude Code is unconditionally required", () => {
  it.each(SURFACES)("%s", (relative) => {
    const lines = readFileSync(path.join(REPO, relative), "utf8").split("\n");
    const offenders = lines
      .map((text, i) => ({ text, line: i + 1, window: lines.slice(i, i + 1 + LOOKAHEAD).join(" ") }))
      .filter(({ text }) => MENTIONS_CLAUDE.test(text) && ASSERTS_A_STARTUP_REQUIREMENT.test(text))
      .filter(({ text }) => !NOT_ABOUT_STARTUP.some((allowed) => allowed.test(text)))
      .filter(({ window }) => !NAMES_THE_ESCAPE.test(window))
      .map(({ line, text }) => `${relative}:${line}  ${text.trim().slice(0, 110)}`);
    expect(offenders.join("\n"), "say what lifts the requirement, or allowlist the line").toBe("");
  });
});
