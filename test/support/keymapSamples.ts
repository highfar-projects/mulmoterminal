// Pulls the `keymap` samples out of a markdown page and reports what is wrong with them.
//
// Split from the spec that scans the repo so the extraction can be tested in BOTH directions on
// inline fixtures: a doc-scanning guard fails SILENTLY the day its regex stops matching — zero
// blocks found, zero failures, green forever — and only a test that feeds it a known-bad sample
// can tell that apart from a clean repo.
import { KEYMAP_ACTIONS, validateKeymap } from "../../common/keymap.js";

// A fenced ```json block, as it appears in the page.
export interface MarkdownJsonBlock {
  /** 1-based position among the json blocks in the file, so a failure names the one to open. */
  ordinal: number;
  text: string;
}

// `\r\n` first: CI checks out on Windows too, and a fence that ends `\r` matches nothing.
// The `> ` strip is what makes a sample inside a blockquote readable as JSON — the guide puts
// several of them in `{: .note }` callouts.
export function jsonBlocks(markdown: string): MarkdownJsonBlock[] {
  const source = markdown.replace(/\r\n/g, "\n");
  return [...source.matchAll(/```json\n([\s\S]*?)```/g)].map((match, i) => ({
    ordinal: i + 1,
    text: (match[1] ?? "")
      .split("\n")
      .map((line) => line.replace(/^> ?/, ""))
      .join("\n"),
  }));
}

const parses = (text: string): boolean => {
  try {
    JSON.parse(text);
    return true;
  } catch {
    return false;
  }
};

// A block written to SHOW something rather than to be copied — `{ "keymap": { "send": [ … ] } }`
// in the keys skill illustrates the partial-merge trap and was never valid JSON. A rule, not an
// allowlist: a list of "blocks we tolerate" grows one entry at a time until it IS the check.
//
// The test is STRUCTURAL — an ellipsis AND unparseable — rather than the ellipsis alone. A real
// sample that happens to carry `…` inside a string still parses, and gets validated like any other;
// the ellipsis on its own would have skipped it in silence (codex, reviewing #2131).
export const isSketch = (block: MarkdownJsonBlock): boolean => block.text.includes("…") && !parses(block.text);

// A `keymap` KEY, quoted or not. Requiring the quotes would skip a sample whose keys are unquoted —
// which is malformed JSON, exactly the thing worth reporting, so the narrow match would have hidden
// it (CodeRabbit, reviewing #2131). A prose mention inside some other sample can match too; that
// block then parses, carries no `keymap`, and validates clean — the safe direction to be wrong in.
const CARRIES_A_KEYMAP = /["']?keymap["']?\s*:/;

// The blocks this guard is about: a real sample carrying a keymap.
export const keymapSamples = (markdown: string): MarkdownJsonBlock[] =>
  jsonBlocks(markdown).filter((block) => CARRIES_A_KEYMAP.test(block.text) && !isSketch(block));

const isRecordValue = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

// Unparseable JSON is reported, not skipped. A sample nobody can paste is the same failure as one
// that pastes and does nothing — and skipping it is how the sketch rule above would quietly widen.
function parsedKeymap(block: MarkdownJsonBlock): { keymap?: unknown; error?: string } {
  try {
    const parsed: unknown = JSON.parse(block.text);
    return isRecordValue(parsed) ? { keymap: parsed.keymap } : { error: "sample is not a JSON object" };
  } catch (cause) {
    return { error: `sample is not valid JSON — ${cause instanceof Error ? cause.message : String(cause)}` };
  }
}

// Which of the two shapes a keymap takes this sample is — an action pointed at a key, a `send` list
// carrying bytes, or both. Read out of the PARSED json, never out of the text: the docs spec uses
// this to assert both shapes are still being reached, and a text match would let that guard be
// weakened to something matching anything at all (codex, reviewing #2131).
export interface SampleShape {
  bindsAnAction: boolean;
  carriesSend: boolean;
}

export function sampleShape(block: MarkdownJsonBlock): SampleShape {
  const { keymap } = parsedKeymap(block);
  if (!isRecordValue(keymap)) return { bindsAnAction: false, carriesSend: false };
  return {
    bindsAnAction: KEYMAP_ACTIONS.some((action) => typeof keymap[action] === "string"),
    carriesSend: Array.isArray(keymap.send) && keymap.send.length > 0,
  };
}

// One line per problem, naming the block so the reader can open it. WARNINGS COUNT: `Cmd+Shift+A`
// is a warning, and it is the whole reason this exists.
export function keymapSampleProblems(markdown: string, label: string): string[] {
  return keymapSamples(markdown).flatMap((block) => {
    const where = `${label} json block #${block.ordinal}`;
    const { keymap, error } = parsedKeymap(block);
    if (error !== undefined) return [`${where}: ${error}`];
    return validateKeymap(keymap).map((problem) => `${where}: keymap.${problem.action} ${JSON.stringify(problem.binding)} — ${problem.reason}`);
  });
}
