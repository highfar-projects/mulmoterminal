// #2622. Header buttons added, removed and moved one at a time; an unconfigured list starts from the
// built-in set, and entries are named by id.
import { describe, it, expect } from "vitest";
import {
  BUTTON_LABEL_MAX,
  MAX_HEADER_BUTTONS,
  buttonFromDraft,
  entriesMoved,
  entriesWithAdded,
  entriesWithout,
  isButtonProblem,
  isEditableRun,
  type ButtonDraft,
  type EntryLike,
} from "../../common/headerButtonEntries";

const draft = (fields: Partial<ButtonDraft>): ButtonDraft => ({
  label: "Build",
  icon: "",
  run: "shell",
  payload: "yarn build",
  target: "url",
  when: "",
  ...fields,
});
const pr: EntryLike = { id: "pr" };
const defaults = [pr];

describe("buttonFromDraft", () => {
  it("builds a shell or an input button, deriving a free id from the label", () => {
    expect(buttonFromDraft(draft({}), [])).toEqual({ entry: { id: "build", label: "Build", run: "shell", cmd: "yarn build" } });
    expect(buttonFromDraft(draft({ run: "input", payload: " /compact ", label: " Compact ", icon: " compress ", when: " agent == claude " }), [])).toEqual({
      entry: { id: "compact", label: "Compact", run: "input", text: "/compact", icon: "compress", when: "agent == claude" },
    });
    expect(buttonFromDraft(draft({}), ["build"])).toEqual({ entry: { id: "build-2", label: "Build", run: "shell", cmd: "yarn build" } });
    expect(buttonFromDraft(draft({ label: "ビルド" }), [])).toMatchObject({ entry: { id: "button" } });
  });

  it("accepts a Material Symbols name or a github octicon, and nothing else as an icon", () => {
    ["build", "play_arrow", "github:repo"].forEach((icon) => expect(buttonFromDraft(draft({ icon }), [])).toHaveProperty("entry"));
    ["Build", "a b", "<svg>", "github:", "github:not-real", "x".repeat(41)].forEach((icon) =>
      expect(buttonFromDraft(draft({ icon }), [])).toEqual({ problem: "icon" }),
    );
  });

  it("builds an open button for each kind of target, and refuses one it cannot open", () => {
    const open = (target: string, payload = "") => buttonFromDraft(draft({ run: "open", target, payload }), []);
    expect(open("url", " https://example.com/${repo} ")).toMatchObject({ entry: { run: "open", open: { url: "https://example.com/${repo}" } } });
    expect(open("files", "${dir}/docs")).toMatchObject({ entry: { open: { files: "${dir}/docs" } } });
    expect(open("reveal", "${dir}")).toMatchObject({ entry: { open: { reveal: "${dir}" } } });
    expect(open("terminal", "${dir}")).toMatchObject({ entry: { open: { terminal: "${dir}" } } });
    expect(open("view", "wiki")).toMatchObject({ entry: { open: { view: "wiki" } } });
    expect(open("pr", "ignored")).toMatchObject({ entry: { open: { pr: true } } });
    expect(open("pickFile")).toMatchObject({ entry: { open: { pickFile: true } } });
    expect(open("url", " ")).toEqual({ problem: "payload" });
    expect(open("view", "nope")).toEqual({ problem: "payload" });
    expect(open("nope", "x")).toEqual({ problem: "target" });
    expect(open("pr")).not.toHaveProperty("entry.cmd");
  });

  it("builds an action button by the operation's current name, and refuses an unknown one", () => {
    const action = (payload: string) => buttonFromDraft(draft({ run: "action", payload }), []);
    expect(action("pane-files")).toMatchObject({ entry: { run: "action", action: "pane-files" } });
    expect(action("restart")).toMatchObject({ entry: { action: "terminal-restart" } });
    expect(action("screen-wiki")).toMatchObject({ entry: { action: "screen-wiki" } });
    expect(action("nope")).toEqual({ problem: "action" });
    expect(action("")).toEqual({ problem: "action" });
  });

  it("refuses a missing or long label, and a missing payload", () => {
    expect(buttonFromDraft(draft({ label: " " }), [])).toEqual({ problem: "label" });
    expect(buttonFromDraft(draft({ label: "x".repeat(BUTTON_LABEL_MAX + 1) }), [])).toEqual({ problem: "label" });
    expect(buttonFromDraft(draft({ label: "x".repeat(BUTTON_LABEL_MAX) }), [])).toHaveProperty("entry");
    expect(buttonFromDraft(draft({ payload: "  " }), [])).toEqual({ problem: "payload" });
  });
});

describe("entriesWithAdded", () => {
  it("keeps the built-in set when nothing was configured, and avoids every id already taken", () => {
    expect(entriesWithAdded(null, defaults, draft({ label: "pr" }))).toEqual({ entries: [pr, { id: "pr-2", label: "pr", run: "shell", cmd: "yarn build" }] });
    const folder: EntryLike = { id: "tools", items: [{ id: "build" }] };
    expect(entriesWithAdded([folder], defaults, draft({}))).toMatchObject({ entries: [folder, { id: "build-2" }] });
  });

  it("refuses past the cap", () => {
    const full = Array.from({ length: MAX_HEADER_BUTTONS }, (_, i) => ({ id: `b${i}` }));
    expect(entriesWithAdded(full, defaults, draft({}))).toEqual({ problem: "full" });
    expect(entriesWithAdded(full.slice(1), defaults, draft({}))).toHaveProperty("entries");
  });
});

describe("entriesWithout / entriesMoved", () => {
  const a: EntryLike = { id: "a" };
  const b: EntryLike = { id: "b" };
  const c: EntryLike = { id: "c" };

  it("removes by id, starting from the built-in set when unconfigured", () => {
    expect(entriesWithout([a, b], defaults, "a")).toEqual({ entries: [b] });
    expect(entriesWithout(null, defaults, "pr")).toEqual({ entries: [] });
    expect(entriesWithout([a], defaults, "gone")).toEqual({ problem: "missing" });
  });

  it("swaps with the neighbour, and refuses at either end, on a missing id, or on an ordered entry", () => {
    expect(entriesMoved([a, b, c], defaults, "b", -1)).toEqual({ entries: [b, a, c] });
    expect(entriesMoved([a, b, c], defaults, "b", 1)).toEqual({ entries: [a, c, b] });
    expect(entriesMoved([a, b], defaults, "a", -1)).toEqual({ problem: "edge" });
    expect(entriesMoved([a, b], defaults, "b", 1)).toEqual({ problem: "edge" });
    expect(entriesMoved([a], defaults, "gone", 1)).toEqual({ problem: "missing" });
    expect(entriesMoved([{ id: "a", order: 1 }, b], defaults, "a", 1)).toEqual({ problem: "ordered" });
    expect(entriesMoved([a, { id: "b", order: 2 }], defaults, "a", 1)).toEqual({ problem: "ordered" });
  });

  it("guards know only their own words", () => {
    expect(isButtonProblem("ordered")).toBe(true);
    expect(isButtonProblem("stale")).toBe(false);
    expect(isEditableRun("shell")).toBe(true);
    expect(isEditableRun("open")).toBe(true);
    expect(isEditableRun("folder")).toBe(false);
  });
});
