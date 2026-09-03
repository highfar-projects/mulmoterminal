// @vitest-environment node
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { isRecord } from "../../../common/isRecord";
import { sanitizeButtons, sanitizeChips, type HeaderContext } from "../../../server/config/header-config";
import { dirSkillsField } from "../../../server/config/config-schema";
import { resolveHeader } from "../../../server/config/header-resolve";

const ctx = (o: Partial<HeaderContext> = {}): HeaderContext => ({
  dir: "/x/myrepo",
  dirName: "myrepo",
  branch: "main",
  repo: "receptron/mulmoterminal",
  model: null,
  agent: "claude",
  session: "s",
  remoteUrl: null,
  dirty: 0,
  ahead: 0,
  behind: 0,
  task: null,
  isGitRepo: true,
  prUrl: null,
  worktreeEnv: [],
  ...o,
});

// CLAUDE.md asks that any config sample in the docs be run through its real validator before it
// ships, because a bad one stops a reader's server from starting or — worse — starts it and
// misbehaves. Nothing enforced that. The guides shipped a GitHub button gated on `isGitRepo`, which
// renders a bare `https://github.com/` link in a repo whose remote is not GitHub; the real default
// used `repo != ` and said why in a comment, and only the copy readers actually paste was wrong
// (CodeRabbit, #1382).
//
// Every ```json block in the guides/skill that configures the header, through the real loaders:
// `buttons`, `chips` and `skills` each have their own, and a sample carrying only chips (the recipes
// in the header reference do) went unchecked while this looked only at buttons (Codex, #1937).
interface DocSample {
  buttons: unknown[] | null;
  chips: unknown[] | null;
  skills: unknown[] | null;
}

// A key that is PRESENT but not an array is the case worth failing on: every loader reads such a
// value as "unconfigured", so a reader who pastes it gets a config that silently does nothing.
// `null` stays legal — config.md documents `"chips": null` as "leave the default alone" — and so
// does an absent key (CodeRabbit, #1937).
function arrayField(raw: Record<string, unknown>, key: string, file: string): unknown[] | null {
  const value = raw[key];
  if (value === undefined || value === null) return null;
  if (!Array.isArray(value)) throw new Error(`${file}: "${key}" is documented as ${typeof value}, which every loader reads as unconfigured`);
  return value;
}

const HEADER_KEYS = ["buttons", "chips", "skills"];

// A ```json fence is not always a whole file: the guides also annotate one inside a blockquote, and
// those do not parse. Skipping them is safe ONLY while they name none of the keys below — a block
// that claims to configure the header and does not parse is a sample a reader would paste and lose.
function parseSample(body: string, file: string): unknown {
  try {
    return JSON.parse(body);
  } catch (e) {
    if (HEADER_KEYS.some((key) => body.includes(`"${key}"`))) throw new Error(`${file}: a header sample is not valid JSON`, { cause: e });
    return null;
  }
}

function docSamples(file: string): DocSample[] {
  const text = readFileSync(path.join(process.cwd(), file), "utf8");
  const out: DocSample[] = [];
  for (const m of text.matchAll(/```json\n([\s\S]*?)```/g)) {
    const parsed = parseSample(m[1], file);
    if (!isRecord(parsed)) continue;
    const sample = { buttons: arrayField(parsed, "buttons", file), chips: arrayField(parsed, "chips", file), skills: arrayField(parsed, "skills", file) };
    if (sample.buttons || sample.chips || sample.skills) out.push(sample);
  }
  return out;
}

const FILES = [
  "docs/guide/en/config.md",
  "docs/guide/ja/config.md",
  "docs/guide/en/header.md",
  "docs/guide/ja/header.md",
  "docs/guide/en/header-reference.md",
  "docs/guide/ja/header-reference.md",
  "server/skills/mulmoterminal-header/SKILL.md",
];

describe("documented config samples survive the real validators", () => {
  for (const file of FILES) {
    it(file, () => {
      const samples = docSamples(file);
      expect(samples.length).toBeGreaterThan(0);
      for (const { buttons, chips, skills } of samples) {
        if (buttons) {
          const clean = sanitizeButtons(buttons);
          if (clean === null) throw new Error(`${file}: sanitizeButtons rejected a sample`);
          expect(clean.length, `${file}: sanitizeButtons dropped entries`).toBe(buttons.length);
          // A gh-style button must not render a bare https://github.com/ when the remote isn't GitHub.
          const noRepo = resolveHeader({ buttons: clean, chips: null }, ctx({ repo: null })).buttons;
          expect(
            noRepo.some((b) => b.open?.url === "https://github.com/"),
            `${file}: bare github.com/ link`,
          ).toBe(false);
        }
        if (chips) {
          const clean = sanitizeChips(chips);
          if (clean === null) throw new Error(`${file}: sanitizeChips rejected a sample`);
          // A misspelled builtin id is dropped silently at load time, so a documented list that
          // shrinks here is a list that would quietly lose a chip for the reader who pasted it.
          expect(clean.length, `${file}: sanitizeChips dropped entries`).toBe(chips.length);
        }
        if (skills) {
          // `skills` trims, dedups and caps; a documented list must survive all three unchanged.
          expect(dirSkillsField.parse(skills), `${file}: skills sample was altered at load`).toEqual(skills);
        }
      }
    });
  }
});
