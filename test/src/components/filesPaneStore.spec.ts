import { describe, it, expect } from "vitest";
import {
  parsePaneStore,
  rememberPane,
  recallPane,
  MAX_REMEMBERED_DIRS,
  MAX_EXPANDED_PATHS,
  MAX_TABS,
  type RememberedPane,
} from "../../../src/components/filesPaneStore";
import { frontTab, oneFile } from "./filesPaneFixture";

// #958. The directory-keyed layer that survives a reload. Most raw values below are in the ONE-FILE
// shape written before tabs (#2267) — every browser already holds some — so they double as the
// upgrade path: each must come back as a single tab. It is a convenience, so every
// failure mode here has to degrade to "remembers nothing" rather than to a broken pane —
// which is why the parse is so forgiving and why the caps exist.
const state = (openPath: string | null, expanded: string[] = [], showPreview = false) => oneFile(openPath, { expanded, showPreview });

describe("parsePaneStore", () => {
  it("reads back what rememberPane wrote", () => {
    const store = rememberPane([], "/proj", state("src/main.ts", ["src"]));
    expect(parsePaneStore(JSON.stringify(store))).toEqual(store);
  });

  it.each([
    ["nothing stored yet", null],
    ["an empty string", ""],
    ["not JSON at all", "{half-written"],
    ["JSON that is not an array", '{"cwd":"/proj"}'],
  ])("returns nothing for %s", (_case, raw) => {
    expect(parsePaneStore(raw)).toEqual([]);
  });

  // A foreign or older value under the same key must not take the pane down with it.
  it.each([
    ["a missing cwd", '[{"state":{"openPath":null,"expanded":[]}}]'],
    ["an empty cwd", '[{"cwd":"","state":{"openPath":null,"expanded":[]}}]'],
    ["a missing state", '[{"cwd":"/proj"}]'],
    ["expanded that is not an array", '[{"cwd":"/proj","state":{"openPath":null,"expanded":"src"}}]'],
    ["a non-string inside expanded", '[{"cwd":"/proj","state":{"openPath":null,"expanded":["src",7]}}]'],
    ["openPath of the wrong type", '[{"cwd":"/proj","state":{"openPath":7,"expanded":[]}}]'],
  ])("drops an entry with %s", (_case, raw) => {
    expect(parsePaneStore(raw)).toEqual([]);
  });

  it("carries the view mode back with the file", () => {
    const store = rememberPane([], "/proj", state("docs/plan.md", [], true));
    expect(frontTab(parsePaneStore(JSON.stringify(store))[0].state)?.showPreview).toBe(true);
  });

  // #2137 arrived after #958, so every entry already in a browser lacks the field — and a mode is
  // worth far less than the open file it would take down with it. Anything but `true` reads as the
  // editor, which is also where a restore lands when the mode no longer holds.
  it.each([
    ["an entry written before the mode was remembered", '[{"cwd":"/proj","state":{"openPath":"a.md","expanded":[]}}]'],
    ["a mode of the wrong type", '[{"cwd":"/proj","state":{"openPath":"a.md","expanded":[],"showPreview":"preview"}}]'],
  ])("keeps the file and falls back to the editor for %s", (_case, raw) => {
    const [entry] = parsePaneStore(raw);
    expect(entry.state.activePath).toBe("a.md");
    expect(frontTab(entry.state)?.showPreview).toBe(false);
  });

  it("keeps the good entries and drops only the bad one", () => {
    const raw = JSON.stringify([{ cwd: "/a", state: state("x.ts") }, { nonsense: true }, { cwd: "/b", state: state(null) }]);
    expect(parsePaneStore(raw).map((e) => e.cwd)).toEqual(["/a", "/b"]);
  });

  // A value written by a build with a larger cap — or by hand — must not come back over either
  // bound. A cap enforced only on write is no cap at all once such a value is in storage, and
  // restore() walks every path in the list.
  it("caps the directory count it reads, not just what it writes", () => {
    const over = Array.from({ length: MAX_REMEMBERED_DIRS + 5 }, (_, i) => ({ cwd: `/p${i}`, state: state(null) }));
    expect(parsePaneStore(JSON.stringify(over))).toHaveLength(MAX_REMEMBERED_DIRS);
  });

  it("caps the expanded list it reads too", () => {
    const huge = Array.from({ length: MAX_EXPANDED_PATHS + 500 }, (_, i) => `dir${i}`);
    const raw = JSON.stringify([{ cwd: "/proj", state: state("a.ts", huge) }]);
    expect(parsePaneStore(raw)[0].state.expanded).toHaveLength(MAX_EXPANDED_PATHS);
  });
});

// #2149 rides the same record: where the reader was in the open file, and how far down the tree
// was scrolled. Both are dropped INDIVIDUALLY when malformed — losing a caret costs a scroll
// position, losing the entry costs the open file.
describe("parseTreeCache — the remembered positions", () => {
  const withPositions = (extra: string) => `[{"cwd":"/proj","state":{"openPath":"a.md","expanded":[],${extra}}}]`;

  it("carries a caret and a scroll offset back", () => {
    const [entry] = parsePaneStore(withPositions('"caret":{"line":31,"col":2},"treeScrollTop":180'));
    expect(frontTab(entry.state)?.caret).toEqual({ line: 31, col: 2 });
    expect(entry.state.treeScrollTop).toBe(180);
  });

  it.each([
    ["a caret that is not an object", '"caret":31'],
    ["a caret with a missing column", '"caret":{"line":31}'],
    ["a caret whose line is a string", '"caret":{"line":"31","col":2}'],
    ["a caret line that is not finite", '"caret":{"line":null,"col":2}'],
    ["a fractional caret line", '"caret":{"line":31.7,"col":2}'],
    ["a fractional caret column", '"caret":{"line":31,"col":2.5}'],
  ])("keeps the file and drops %s", (_case, extra) => {
    const [entry] = parsePaneStore(withPositions(extra));
    expect(entry.state.activePath).toBe("a.md");
    expect(frontTab(entry.state)?.caret).toBeUndefined();
  });

  it("carries a top line back", () => {
    const [entry] = parsePaneStore(withPositions('"topLine":130'));
    expect(frontTab(entry.state)?.topLine).toBe(130);
  });

  it.each([
    ["a top line of zero — no document has one", '"topLine":0'],
    ["a fractional top line", '"topLine":12.5'],
    ["a top line that is a string", '"topLine":"12"'],
  ])("keeps the file and drops %s", (_case, extra) => {
    const [entry] = parsePaneStore(withPositions(extra));
    expect(entry.state.activePath).toBe("a.md");
    expect(frontTab(entry.state)?.topLine).toBeUndefined();
  });

  it.each([
    ["a scroll offset that is a string", '"treeScrollTop":"180"'],
    ["a negative scroll offset", '"treeScrollTop":-40'],
  ])("keeps the file and drops %s", (_case, extra) => {
    const [entry] = parsePaneStore(withPositions(extra));
    expect(entry.state.activePath).toBe("a.md");
    expect(entry.state.treeScrollTop).toBeUndefined();
  });

  // #2157, and the reason it is here rather than only in the pane's spec: `capped` builds its
  // result field by field, so a field it does not name is dropped between the snapshot and
  // storage — with the types still claiming it survived. Found by driving the app, where the
  // preview came back at the top of a file the reader had been halfway down.
  it("carries a preview offset back", () => {
    const [entry] = parsePaneStore(withPositions('"previewScrollTop":2400'));
    expect(frontTab(entry.state)?.previewScrollTop).toBe(2400);
  });

  it.each([
    ["a preview offset that is a string", '"previewScrollTop":"2400"'],
    ["a negative preview offset", '"previewScrollTop":-40'],
    ["a preview offset that is not finite", '"previewScrollTop":null'],
  ])("keeps the file and drops %s", (_case, extra) => {
    const [entry] = parsePaneStore(withPositions(extra));
    expect(entry.state.activePath).toBe("a.md");
    expect(frontTab(entry.state)?.previewScrollTop).toBeUndefined();
  });

  it("makes the round trip a snapshot actually takes", () => {
    const remembered = rememberPane([], "/proj", oneFile("a.md", { showPreview: true, previewScrollTop: 2400 }));
    const [entry] = parsePaneStore(JSON.stringify(remembered));
    expect(frontTab(entry.state)?.previewScrollTop).toBe(2400);
  });

  it("survives an entry written before either existed", () => {
    const [entry] = parsePaneStore('[{"cwd":"/proj","state":{"openPath":"a.md","expanded":[]}}]');
    expect(entry.state).toEqual(oneFile("a.md", { showPreview: false }));
  });
});

describe("rememberPane", () => {
  it("puts the newest directory first", () => {
    const store = rememberPane(rememberPane([], "/a", state("a.ts")), "/b", state("b.ts"));
    expect(store.map((e) => e.cwd)).toEqual(["/b", "/a"]);
  });

  // Re-recording a directory has to REPLACE it, or the same cwd accumulates entries and the
  // cap starts evicting other projects to hold copies of one.
  it("replaces a directory rather than appending a second entry", () => {
    const store = rememberPane(rememberPane([], "/a", state("old.ts")), "/a", state("new.ts"));
    expect(store).toHaveLength(1);
    expect(store[0].state.activePath).toBe("new.ts");
  });

  it("drops the least recently used past the cap", () => {
    const full = Array.from({ length: MAX_REMEMBERED_DIRS }, (_, i) => `/p${i}`).reduce<RememberedPane[]>((s, cwd) => rememberPane(s, cwd, state(null)), []);
    const after = rememberPane(full, "/fresh", state(null));
    expect(after).toHaveLength(MAX_REMEMBERED_DIRS);
    expect(after[0].cwd).toBe("/fresh");
    expect(after.map((e) => e.cwd)).not.toContain("/p0"); // the oldest, evicted
  });

  // One directory walked deeply open would otherwise be big enough to fail the whole write on
  // quota — costing every OTHER directory its entry too.
  it("trims a pathological expanded list", () => {
    const huge = Array.from({ length: MAX_EXPANDED_PATHS + 50 }, (_, i) => `dir${i}`);
    expect(rememberPane([], "/proj", state(null, huge))[0].state.expanded).toHaveLength(MAX_EXPANDED_PATHS);
  });
});

describe("recallPane", () => {
  it("finds the directory's own state", () => {
    const store = rememberPane(rememberPane([], "/a", state("a.ts")), "/b", state("b.ts"));
    expect(recallPane(store, "/a")?.activePath).toBe("a.ts");
  });

  it.each([
    ["a directory never seen", "/never"],
    ["no directory at all", null],
  ])("returns null for %s", (_case, cwd) => {
    expect(recallPane(rememberPane([], "/a", state("a.ts")), cwd)).toBeNull();
  });
});

// #2267: the shape written from now on — the open files as tabs, one of them in front.
describe("parsePaneStore — tabs", () => {
  const withState = (state: unknown) => JSON.stringify([{ cwd: "/proj", state }]);

  it("reads back every tab and which one is in front", () => {
    const stored = {
      tabs: [
        { path: "a.md", showPreview: true },
        { path: "b.ts", caret: { line: 3, col: 1 } },
      ],
      activePath: "b.ts",
      expanded: ["src"],
    };
    expect(parsePaneStore(withState(stored))[0].state).toEqual({
      tabs: [
        { path: "a.md", showPreview: true },
        { path: "b.ts", showPreview: false, caret: { line: 3, col: 1 } },
      ],
      activePath: "b.ts",
      expanded: ["src"],
    });
  });

  // One unreadable tab must not cost the reader the others.
  it.each([
    ["a tab that is not an object", 7],
    ["a tab with no path", { showPreview: true }],
    ["a tab whose path is not a string", { path: 3 }],
    ["a tab with an empty path", { path: "" }],
  ])("drops %s and keeps the rest", (_case, bad) => {
    const [entry] = parsePaneStore(withState({ tabs: [{ path: "a.md" }, bad], activePath: "a.md", expanded: [] }));
    expect(entry.state.tabs.map((tab) => tab.path)).toEqual(["a.md"]);
  });

  it("has no front when it names a tab that is not there", () => {
    expect(parsePaneStore(withState({ tabs: [{ path: "a.md" }], activePath: "gone.md", expanded: [] }))[0].state.activePath).toBeNull();
  });

  it("drops the entry when the tabs are not a list", () => {
    expect(parsePaneStore(withState({ tabs: "a.md", activePath: "a.md", expanded: [] }))).toEqual([]);
  });

  it("caps the tabs it reads", () => {
    const tabs = Array.from({ length: MAX_TABS + 10 }, (_, i) => ({ path: `f${i}.ts` }));
    expect(parsePaneStore(withState({ tabs, activePath: "f0.ts", expanded: [] }))[0].state.tabs).toHaveLength(MAX_TABS);
  });

  it("writes the tabs shape", () => {
    const [entry] = rememberPane([], "/proj", oneFile("a.md", { showPreview: true }));
    expect(entry.state).toEqual({ tabs: [{ path: "a.md", showPreview: true }], activePath: "a.md", expanded: [] });
  });
});

// The upgrade path as a property rather than a list of cases: whatever the one-file shape held, it
// reads back as that file in front as the only tab, carrying the same facts a restore puts back —
// or as nothing open. Checked against the old reader on the day this shipped (264,600 states, no
// difference); what stays is the property.
interface OneFileFields {
  openPath: unknown;
  showPreview: unknown;
  caret: { line: number; col: number } | undefined;
  topLine: number | undefined;
  previewScrollTop: number | undefined;
}

const OPEN_PATHS: unknown[] = [null, "", "a.md", 3];
const MODES: unknown[] = [undefined, true, false, "yes"];
const CARETS: OneFileFields["caret"][] = [undefined, { line: 3, col: 2 }, { line: 1.5, col: 0 }];
const TOP_LINES: (number | undefined)[] = [undefined, 7, 0];
const PREVIEW_OFFSETS: (number | undefined)[] = [undefined, 120, -5];

/** Every combination, by counting through them as one number with a digit per list. */
const ONE_FILE_CASES: OneFileFields[] = Array.from(
  { length: OPEN_PATHS.length * MODES.length * CARETS.length * TOP_LINES.length * PREVIEW_OFFSETS.length },
  (_, n) => {
    const pick = <T>(list: T[], divisor: number): T | undefined => list[Math.floor(n / divisor) % list.length];
    return {
      openPath: pick(OPEN_PATHS, 1),
      showPreview: pick(MODES, OPEN_PATHS.length),
      caret: pick(CARETS, OPEN_PATHS.length * MODES.length),
      topLine: pick(TOP_LINES, OPEN_PATHS.length * MODES.length * CARETS.length),
      previewScrollTop: pick(PREVIEW_OFFSETS, OPEN_PATHS.length * MODES.length * CARETS.length * TOP_LINES.length),
    };
  },
);

const expectOneTab = (fields: OneFileFields, entry: RememberedPane | undefined): void => {
  // Neither a string nor null: not a pane state at all, as before.
  if (fields.openPath !== null && typeof fields.openPath !== "string") return expect(entry).toBeUndefined();
  // Nothing open — null, or the empty path the pane never opened.
  if (!fields.openPath) return expect(entry?.state).toMatchObject({ tabs: [], activePath: null });
  expect(entry?.state.activePath).toBe(fields.openPath);
  expect(entry?.state.tabs).toEqual([
    {
      path: fields.openPath,
      showPreview: fields.showPreview === true,
      ...(Number.isInteger(fields.caret?.line) ? { caret: fields.caret } : {}),
      ...(fields.topLine !== undefined && fields.topLine >= 1 ? { topLine: fields.topLine } : {}),
      ...(fields.previewScrollTop !== undefined && fields.previewScrollTop >= 0 ? { previewScrollTop: fields.previewScrollTop } : {}),
    },
  ]);
};

describe("parsePaneStore — the one-file shape becomes one tab", () => {
  it.each(ONE_FILE_CASES)("reads %o as its file alone", (fields) => {
    expectOneTab(fields, parsePaneStore(JSON.stringify([{ cwd: "/proj", state: { ...fields, expanded: [] } }]))[0]);
  });
});
