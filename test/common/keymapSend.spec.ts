import { describe, it, expect } from "vitest";
import { sanitizeKeymap, sendBytesFor, validateKeymap, type Keymap } from "../../common/keymap.js";
import { clipboardActionFor } from "../../common/terminalClipboard.js";

// #1005 — a key that puts bytes into the terminal instead of running an app action.
//
// The payloads here are written as JSON writes them: CTRL_E is Ctrl+E (end of line) and CTRL_A is
// Ctrl+A (start of line), which is what the requester wanted Cmd+Right / Cmd+Left to do.
const CTRL_E = "\u0005";
const CTRL_A = "\u0001";

const keydown = (over: Partial<{ key: string; shiftKey: boolean; altKey: boolean; ctrlKey: boolean; metaKey: boolean; isComposing: boolean }> = {}) => ({
  type: "keydown",
  key: "ArrowRight",
  shiftKey: false,
  altKey: false,
  ctrlKey: false,
  metaKey: true,
  ...over,
});

const withSend = (send: Keymap["send"]): Keymap => ({ ...(send ? { send } : {}) });

describe("sendBytesFor", () => {
  it("returns the bound bytes for a matching keystroke", () => {
    const keymap = withSend([{ key: "Cmd+ArrowRight", bytes: CTRL_E }]);
    expect(sendBytesFor(keymap, keydown())).toBe(CTRL_E);
  });

  it("tells two bindings apart", () => {
    const keymap = withSend([
      { key: "Cmd+ArrowRight", bytes: CTRL_E },
      { key: "Cmd+ArrowLeft", bytes: CTRL_A },
    ]);
    expect(sendBytesFor(keymap, keydown({ key: "ArrowRight" }))).toBe(CTRL_E);
    expect(sendBytesFor(keymap, keydown({ key: "ArrowLeft" }))).toBe(CTRL_A);
  });

  // The reason this feature is a LIST and not one more action: the payload differs per key, so a
  // single `send: "..."` field could only ever name one of them.
  it("carries a different payload per key, which one field could not", () => {
    const keymap = withSend([
      { key: "Alt+b", bytes: "\u001bb" },
      { key: "Alt+f", bytes: "\u001bf" },
    ]);
    expect(sendBytesFor(keymap, keydown({ key: "b", altKey: true, metaKey: false }))).toBe("\u001bb");
    expect(sendBytesFor(keymap, keydown({ key: "f", altKey: true, metaKey: false }))).toBe("\u001bf");
  });

  it("requires every modifier to match, so Shift+Cmd+Right is not Cmd+Right", () => {
    const keymap = withSend([{ key: "Cmd+ArrowRight", bytes: CTRL_E }]);
    expect(sendBytesFor(keymap, keydown({ shiftKey: true }))).toBeNull();
  });

  it("ignores keyup and IME composition, like every other binding", () => {
    const keymap = withSend([{ key: "Cmd+ArrowRight", bytes: CTRL_E }]);
    expect(sendBytesFor(keymap, { ...keydown(), type: "keyup" })).toBeNull();
    expect(sendBytesFor(keymap, keydown({ isComposing: true }))).toBeNull();
  });

  it("is null with no send list at all, so an unconfigured install takes no key", () => {
    expect(sendBytesFor({}, keydown())).toBeNull();
    expect(sendBytesFor({ "zoom-next": "Cmd+ArrowRight" }, keydown())).toBeNull();
  });

  it("skips an unparseable key rather than throwing", () => {
    const keymap = withSend([
      { key: "Cmd++", bytes: "x" },
      { key: "Cmd+ArrowRight", bytes: CTRL_E },
    ]);
    expect(sendBytesFor(keymap, keydown())).toBe(CTRL_E);
  });

  it("uses the first entry when a keystroke is listed twice", () => {
    const keymap = withSend([
      { key: "Cmd+ArrowRight", bytes: CTRL_E },
      { key: "Cmd+ArrowRight", bytes: CTRL_A },
    ]);
    expect(sendBytesFor(keymap, keydown())).toBe(CTRL_E);
  });
});

describe("validateKeymap — send", () => {
  const reasons = (input: unknown) => validateKeymap(input).map((p) => `${p.action}: ${p.reason}`);

  it("accepts a well-formed list", () => {
    expect(validateKeymap({ send: [{ key: "Cmd+ArrowRight", bytes: CTRL_E }] })).toEqual([]);
  });

  it("refuses a send that is not an array", () => {
    const problems = validateKeymap({ send: { "Cmd+ArrowRight": CTRL_E } });
    expect(problems).toHaveLength(1);
    expect(problems[0].fatal).toBe(true);
  });

  it.each([
    ["a missing bytes", { key: "Cmd+ArrowRight" }],
    ["a missing key", { bytes: CTRL_E }],
    ["a bare string", "Cmd+ArrowRight"],
  ])("refuses %s", (_case, entry) => {
    const problems = validateKeymap({ send: [entry] });
    expect(problems.map((p) => p.action)).toEqual(["send[0]"]);
    expect(problems[0].fatal).toBe(true);
  });

  it("refuses an unparseable key, naming which entry", () => {
    expect(reasons({ send: [{ key: "Nope+ArrowRight", bytes: CTRL_E }] })[0]).toMatch(/^send\[0\]: unparseable/);
  });

  // Empty bytes would take the key away from the terminal and put nothing back, which reads as
  // "this key stopped working" — worse than an unbound key.
  it("refuses empty bytes", () => {
    const problems = validateKeymap({ send: [{ key: "Cmd+ArrowRight", bytes: "" }] });
    expect(problems[0].fatal).toBe(true);
    expect(problems[0].reason).toMatch(/empty/);
  });

  it("reports the offending index, not just that something is wrong", () => {
    const problems = validateKeymap({
      send: [
        { key: "Cmd+ArrowRight", bytes: CTRL_E },
        { key: "Cmd++", bytes: CTRL_A },
      ],
    });
    expect(problems.map((p) => p.action)).toEqual(["send[1]"]);
  });
});

// The collision rule, and it is NOT a toss-up: the grid's handler listens on `window` in the
// CAPTURE phase and calls stopPropagation(), so the event never reaches the terminal's xterm.
// An action always wins, and the send binding silently never fires — which is exactly why it
// has to be warned about rather than left to be discovered by pressing the key.
describe("validateKeymap — a send and an action on one keystroke", () => {
  const both = { "zoom-next": "Cmd+ArrowRight", send: [{ key: "Cmd+ArrowRight", bytes: CTRL_E }] };

  it("warns, and names the action as the winner", () => {
    const problems = validateKeymap(both);
    expect(problems).toHaveLength(1);
    expect(problems[0].action).toBe("send[0]");
    expect(problems[0].reason).toContain("zoom-next");
    expect(problems[0].fatal).toBe(false); // a shortcut lost, not a config that cannot load
  });

  it("names the action even when the send entry is written FIRST in the file", () => {
    const problems = validateKeymap({ send: [{ key: "Cmd+ArrowRight", bytes: CTRL_E }], "zoom-next": "Cmd+ArrowRight" });
    expect(problems[0].action).toBe("send[0]");
    expect(problems[0].reason).toContain("zoom-next");
  });

  // #1901. The warning used to name the action as the winner in every collision, on the strength
  // of a comment saying "every action outranks every send binding, because the grid's handler runs
  // in the capture phase". `copy` never reaches that handler — it is TERMINAL_SCOPED, decided by
  // clipboardActionFor, which returns null with no selection so the send fires. A user with both
  // on Ctrl+C was told `copy` wins, and then watched the send happen.
  it("does not claim `copy` wins outright over a send — it depends on the selection", () => {
    const problems = validateKeymap({ copy: "Ctrl+c", send: [{ key: "Ctrl+c", bytes: CTRL_A }] });

    expect(problems.map((p) => p.action)).toEqual(["send[0]"]);
    expect(problems[0].reason).toContain("only while text is selected");
    expect(problems[0].reason).toContain("send[0]");
    // The old wording, which was the whole defect.
    expect(problems[0].reason).not.toContain("only `copy` will fire");
  });

  // `paste` is terminal-scoped too, but unconditional: clipboardActionFor returns it whether or
  // not anything is selected, and it is decided before the send. So the plain wording is right.
  it("still says `paste` wins outright over a send", () => {
    const problems = validateKeymap({ paste: "Ctrl+v", send: [{ key: "Ctrl+v", bytes: CTRL_A }] });

    expect(problems[0].reason).toContain("only `paste` will fire");
  });

  // Everything that DOES go through the grid keeps the plain wording — the fix is one exception,
  // not a rewrite of the rule.
  it("still says a grid action wins outright over a send", () => {
    const problems = validateKeymap({ "zoom-next": "Ctrl+c", send: [{ key: "Ctrl+c", bytes: CTRL_A }] });

    expect(problems[0].reason).toContain("only `zoom-next` will fire");
  });

  // The three-way collision, and the reason the winner has to be resolved per GROUP rather than
  // pairwise (codex on #1906). With copy plus TWO sends on one key there are two reachable claims
  // and no more: copy with a selection, `send[0]` without one — because `sendBytesFor` takes the
  // first match. Telling the user `send[1]` "fires when nothing is selected" is the same class of
  // lie #1901 was filed for, just one entry further down.
  it("names the first send as the no-selection winner and says the later ones never fire", () => {
    const problems = validateKeymap({
      copy: "Ctrl+c",
      send: [
        { key: "Ctrl+c", bytes: CTRL_A },
        { key: "Ctrl+c", bytes: CTRL_E },
      ],
    });

    expect(problems.map((p) => p.action)).toEqual(["send[0]", "send[1]"]);
    expect(problems[0].reason).toContain("only while text is selected");
    expect(problems[0].reason).toContain("`send[0]` fires when nothing is");

    expect(problems[1].reason).toContain("never fires");
    expect(problems[1].reason).toContain("`send[0]` when nothing is");
    // The defect: send[1] was told it fires in the gap that send[0] already takes.
    expect(problems[1].reason).not.toContain("`send[1]` fires when nothing is");
  });

  // A second ACTION on the key is unreachable in BOTH states, because actionForKey returns the
  // lowest-ranked bound action and stops — so `paste` here never runs, and the claim that fires
  // without a selection is still the send. Saying "only `copy` will fire" would be wrong twice.
  it("does not promote a second action into copy's no-selection gap", () => {
    const problems = validateKeymap({ copy: "Ctrl+c", paste: "Ctrl+c", send: [{ key: "Ctrl+c", bytes: CTRL_A }] });

    const paste = problems.find((p) => p.action === "paste");
    expect(paste?.reason).toContain("never fires");
    expect(paste?.reason).toContain("`send[0]` when nothing is");

    const send = problems.find((p) => p.action === "send[0]");
    expect(send?.reason).toContain("`send[0]` fires when nothing is");
  });

  it("warns about the later of two send entries claiming one keystroke", () => {
    const problems = validateKeymap({
      send: [
        { key: "Cmd+ArrowRight", bytes: CTRL_E },
        { key: "cmd+ArrowRight", bytes: CTRL_A },
      ],
    });
    expect(problems.map((p) => p.action)).toEqual(["send[1]"]);
    expect(problems[0].reason).toContain("send[0]");
  });
});

describe("sanitizeKeymap — send", () => {
  it("keeps a valid list alongside the action bindings", () => {
    const keymap = sanitizeKeymap({ "zoom-next": "PageDown", send: [{ key: "Cmd+ArrowRight", bytes: CTRL_E }] });
    expect(keymap).toEqual({ "zoom-next": "PageDown", send: [{ key: "Cmd+ArrowRight", bytes: CTRL_E }] });
  });

  it("drops the malformed entries and keeps the rest", () => {
    const keymap = sanitizeKeymap({
      send: [{ key: "Cmd++", bytes: "x" }, { key: "Cmd+ArrowRight", bytes: CTRL_E }, { key: "Cmd+k", bytes: "" }, { nope: 1 }],
    });
    expect(keymap.send).toEqual([{ key: "Cmd+ArrowRight", bytes: CTRL_E }]);
  });

  // Absent and emptied must look the same downstream, so nothing has to test for both.
  it.each([
    ["a non-array", { send: "nope" }],
    ["an all-invalid list", { send: [{ key: "Cmd++", bytes: "x" }] }],
    ["an empty list", { send: [] }],
  ])("omits send entirely for %s", (_case, input) => {
    expect(sanitizeKeymap(input)).not.toHaveProperty("send");
  });

  it("survives the round trip a config takes, so a saved binding still fires", () => {
    const keymap = sanitizeKeymap(JSON.parse(JSON.stringify({ send: [{ key: "Cmd+ArrowRight", bytes: CTRL_E }] })));
    expect(sendBytesFor(keymap, keydown())).toBe(CTRL_E);
  });
});

// The warning above is only worth having if it describes what dispatch actually does. These pin
// the behaviour it claims, in the same file, so the message and the runtime cannot drift apart —
// which is exactly how #1901 happened: a comment asserted a rule, the message was generated from
// it, and neither was ever checked against terminalClipboard.
describe("copy vs send on one keystroke — what actually happens", () => {
  const KEYMAP: Keymap = { copy: "Ctrl+c", send: [{ key: "Ctrl+c", bytes: CTRL_A }] };
  const ctrlC = { ...keydown({ key: "c", ctrlKey: true, metaKey: false }), type: "keydown" };

  it("copy takes the key while something is selected", () => {
    expect(clipboardActionFor(KEYMAP, ctrlC, true)).toBe("copy");
  });

  it("with nothing selected copy stands aside and the send fires — the case the old warning denied", () => {
    expect(clipboardActionFor(KEYMAP, ctrlC, false)).toBeNull();
    expect(sendBytesFor(KEYMAP, ctrlC)).toBe(CTRL_A);
  });

  // What makes `send[1]` unreachable rather than merely second: dispatch never consults it, in
  // either selection state. This is the runtime half of the warning above.
  it("a second send on the same key is unreachable — the first match wins", () => {
    const twoSends: Keymap = {
      copy: "Ctrl+c",
      send: [
        { key: "Ctrl+c", bytes: CTRL_A },
        { key: "Ctrl+c", bytes: CTRL_E },
      ],
    };

    expect(clipboardActionFor(twoSends, ctrlC, true)).toBe("copy");
    expect(clipboardActionFor(twoSends, ctrlC, false)).toBeNull();
    expect(sendBytesFor(twoSends, ctrlC)).toBe(CTRL_A);
  });
});
