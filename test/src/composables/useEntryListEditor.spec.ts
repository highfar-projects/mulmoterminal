// The add/remove state the Accounts, Custom agents and Providers editors share: one change at a time,
// and what a refusal leaves on screen.
import { describe, it, expect } from "vitest";
import type { EntryChange } from "../../../src/composables/configEntryChange";
import { entryChangeOutcome } from "../../../src/composables/entryChangeOutcome";
import { useEntryListEditor } from "../../../src/composables/useEntryListEditor";

const PROBLEM_WORDS = [null, "duplicate", "invalid", ""] as const;
type Word = Exclude<(typeof PROBLEM_WORDS)[number], null>;
const BODIES = [null, {}, { list: [] }] as const;

// Every shape a change can answer with: accepted, or refused with or without a word and a body.
const ALL_CHANGES: EntryChange<Word>[] = [
  { ok: true, body: {} },
  { ok: true, body: { list: [1] } },
  ...PROBLEM_WORDS.flatMap((problem) => BODIES.map((body): EntryChange<Word> => ({ ok: false, problem, body }))),
];

describe("entryChangeOutcome", () => {
  it.each(ALL_CHANGES)("an accepted change clears both, a refusal keeps its word or says refused: %j", (change) => {
    const outcome = entryChangeOutcome(change);
    if (change.ok) expect(outcome).toEqual({ refused: false, serverProblem: null });
    else expect(outcome).toEqual({ refused: change.problem === null, serverProblem: change.problem });
  });

  it("never reports both a word and a bare refusal", () => {
    ALL_CHANGES.forEach((change) => {
      const outcome = entryChangeOutcome(change);
      expect(outcome.refused && outcome.serverProblem !== null).toBe(false);
    });
  });

  it("treats an empty problem word as a word, not as no word", () => {
    expect(entryChangeOutcome<Word>({ ok: false, problem: "", body: null })).toEqual({ refused: false, serverProblem: "" });
  });
});

function heldChanger(answer: EntryChange<Word>) {
  const sent: [string, Record<string, unknown>][] = [];
  const release: (() => void)[] = [];
  const change = async (action: "add" | "remove", payload: Record<string, unknown>): Promise<EntryChange<Word>> => {
    sent.push([action, payload]);
    await new Promise<void>((resolve) => release.push(resolve));
    return answer;
  };
  return { sent, release, change };
}

describe("useEntryListEditor", () => {
  it.each(ALL_CHANGES)("is saving only while the change is out, then shows its outcome: %j", async (answer) => {
    const server = heldChanger(answer);
    const editor = useEntryListEditor(server.change);
    expect([editor.saving.value, editor.refused.value, editor.serverProblem.value]).toEqual([false, false, null]);
    const pending = editor.apply("add", { label: "a" });
    expect(editor.saving.value).toBe(true);
    server.release.forEach((resolve) => resolve());
    expect(await pending).toBe(answer.ok);
    expect(editor.saving.value).toBe(false);
    expect({ refused: editor.refused.value, serverProblem: editor.serverProblem.value }).toEqual(entryChangeOutcome(answer));
  });

  it("drops a remove asked for while a change is out", async () => {
    const server = heldChanger({ ok: true, body: {} });
    const editor = useEntryListEditor(server.change);
    const pending = editor.apply("add", { label: "a" });
    editor.remove("b");
    server.release.forEach((resolve) => resolve());
    await pending;
    expect(server.sent).toEqual([["add", { label: "a" }]]);
  });

  it("sends a remove by id when idle", async () => {
    const server = heldChanger({ ok: false, problem: null, body: null });
    const editor = useEntryListEditor(server.change);
    editor.remove("b");
    expect(server.sent).toEqual([["remove", { id: "b" }]]);
    expect(editor.saving.value).toBe(true);
    server.release.forEach((resolve) => resolve());
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect([editor.saving.value, editor.refused.value]).toEqual([false, true]);
  });

  it("a later accepted change clears an earlier refusal", async () => {
    const answers: EntryChange<Word>[] = [
      { ok: false, problem: "duplicate", body: null },
      { ok: true, body: {} },
    ];
    const editor = useEntryListEditor<Word>(async () => answers.shift() ?? { ok: true, body: {} });
    await editor.apply("add", {});
    expect(editor.serverProblem.value).toBe("duplicate");
    await editor.apply("add", {});
    expect([editor.refused.value, editor.serverProblem.value]).toEqual([false, null]);
  });
});
