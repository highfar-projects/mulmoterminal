// @vitest-environment node
import { describe, it, expect } from "vitest";
import { githubIconOf } from "../../../common/githubIcons";
import { CELL_ACTIONS, HEADER_ACTIONS } from "../../../common/headerActions";
import {
  sanitizeButtons,
  sanitizeChips,
  sanitizeHeaderConfig,
  mergeHeaderConfig,
  DEFAULT_BUTTONS,
  type HeaderConfig,
} from "../../../server/config/header-config.js";
import { isHeaderFolder, type HeaderButton, type HeaderEntry } from "../../../server/config/config-schema.js";

// A top-level entry the case expects to be a plain button, not a folder.
const button = (entry: HeaderEntry | undefined): HeaderButton => {
  if (!entry || isHeaderFolder(entry)) throw new Error("expected a button");
  return entry;
};

// `null` is the sanitizers' "unconfigured" signal; these cases all pass a configured value.
const configured = <T>(value: T | null): T => {
  if (value === null) throw new Error("expected a configured value, got null");
  return value;
};

describe("sanitizeButtons", () => {
  it("keeps a valid shell/input/open button with its matching payload", () => {
    const out = configured(
      sanitizeButtons([
        { id: "lint", label: "Lint", run: "shell", cmd: "yarn lint" },
        { id: "c", label: "Compact", run: "input", text: "/compact" },
        { id: "gh", label: "GH", run: "open", open: { url: "https://x" } },
      ]),
    );
    expect(out.map((b) => b.id)).toEqual(["lint", "c", "gh"]);
    expect(button(out[2]).open).toEqual({ url: "https://x" });
  });

  it("drops a button missing id/label/run or with a mismatched payload", () => {
    expect(sanitizeButtons([{ label: "x", run: "shell", cmd: "y" }])).toEqual([]); // no id
    expect(sanitizeButtons([{ id: "a", label: "x", run: "shell" }])).toEqual([]); // shell without cmd
    expect(sanitizeButtons([{ id: "a", label: "x", run: "input" }])).toEqual([]); // input without text
    expect(sanitizeButtons([{ id: "a", label: "x", run: "nope", cmd: "y" }])).toEqual([]); // bad run
  });

  it("dedupes by id (first wins) and only keeps known open view targets", () => {
    const out = configured(
      sanitizeButtons([
        { id: "a", label: "A", run: "shell", cmd: "1" },
        { id: "a", label: "A2", run: "shell", cmd: "2" },
        { id: "v", label: "V", run: "open", open: { view: "bogus" } },
        { id: "w", label: "W", run: "open", open: { view: "diff" } },
      ]),
    );
    expect(out.map((b) => b.id)).toEqual(["a", "w"]); // dup 'a' collapsed, bogus-view 'v' dropped
    expect(out[0].label).toBe("A");
  });

  it("returns null for non-array input (unconfigured = use DEFAULT_BUTTONS)", () => {
    expect(sanitizeButtons(undefined)).toBeNull();
    expect(sanitizeButtons({})).toBeNull();
  });

  it("keeps an empty array as configured-but-empty (replaces the defaults with nothing)", () => {
    expect(sanitizeButtons([])).toEqual([]);
  });
});

describe("sanitizeChips", () => {
  it("returns null when chips is absent or not an array (unconfigured = use default)", () => {
    expect(sanitizeChips(undefined)).toBeNull();
    expect(sanitizeChips("dir")).toBeNull();
  });

  it("keeps built-in ids, drops unknown strings, keeps custom {label,text}", () => {
    expect(sanitizeChips(["dir", "git", "bogus", { label: "↑↓", text: "${ahead}" }])).toEqual(["dir", "git", { label: "↑↓", text: "${ahead}" }]);
  });

  it("keeps an empty array as configured-but-empty (hide all built-ins)", () => {
    expect(sanitizeChips([])).toEqual([]);
  });

  it("drops a custom chip missing label, missing text, or with empty text", () => {
    expect(sanitizeChips([{ label: "x" }, { text: "y" }, { label: "z", text: "" }])).toEqual([]);
  });
});

describe("sanitizeHeaderConfig", () => {
  it("assembles buttons + chips, defaulting a non-object to null/null", () => {
    expect(sanitizeHeaderConfig(null)).toEqual({ buttons: null, chips: null, commands: [] });
    expect(sanitizeHeaderConfig({ buttons: [{ id: "a", label: "A", run: "shell", cmd: "x" }], chips: ["dir"] })).toEqual({
      buttons: [{ id: "a", label: "A", run: "shell", cmd: "x" }],
      chips: ["dir"],
      commands: [],
    });
  });
});

describe("mergeHeaderConfig", () => {
  const g: HeaderConfig = {
    buttons: [
      { id: "shared", label: "G", run: "shell", cmd: "g" },
      { id: "gonly", label: "GO", run: "shell", cmd: "go" },
    ],
    chips: ["dir", "git"],
  };

  it("lets the project override a button by id and add its own", () => {
    const p: HeaderConfig = {
      buttons: [
        { id: "shared", label: "P", run: "shell", cmd: "p" },
        { id: "ponly", label: "PO", run: "shell", cmd: "po" },
      ],
      chips: null,
    };
    const out = mergeHeaderConfig(g, p);
    expect(
      configured(out.buttons)
        .map((b) => `${b.id}:${b.label}`)
        .sort(),
    ).toEqual(["gonly:GO", "ponly:PO", "shared:P"]);
  });

  it("orders by `order` (undefined last), stable within equal order", () => {
    const out = mergeHeaderConfig(
      {
        buttons: [
          { id: "a", label: "A", run: "shell", cmd: "x", order: 20 },
          { id: "b", label: "B", run: "shell", cmd: "x" },
        ],
        chips: null,
      },
      { buttons: [{ id: "c", label: "C", run: "shell", cmd: "x", order: 10 }], chips: null },
    );
    expect(configured(out.buttons).map((b) => b.id)).toEqual(["c", "a", "b"]);
  });

  it("takes the project's chips when set, else the global's, and passes null through", () => {
    expect(mergeHeaderConfig(g, { buttons: [], chips: ["ctx"] }).chips).toEqual(["ctx"]);
    expect(mergeHeaderConfig(g, { buttons: [], chips: null }).chips).toEqual(["dir", "git"]);
    expect(mergeHeaderConfig({ buttons: [], chips: null }, { buttons: [], chips: null }).chips).toBeNull();
  });

  it("keeps buttons null (unconfigured → defaults) only when BOTH levels are unconfigured", () => {
    expect(mergeHeaderConfig({ buttons: null, chips: null }, { buttons: null, chips: null }).buttons).toBeNull();
    const onlyGlobal = mergeHeaderConfig({ buttons: [{ id: "a", label: "A", run: "shell", cmd: "x" }], chips: null }, { buttons: null, chips: null });
    expect(onlyGlobal.buttons).toEqual([{ id: "a", label: "A", run: "shell", cmd: "x" }]);
    const onlyProject = mergeHeaderConfig({ buttons: null, chips: null }, { buttons: [{ id: "b", label: "B", run: "shell", cmd: "y" }], chips: null });
    expect(onlyProject.buttons).toEqual([{ id: "b", label: "B", run: "shell", cmd: "y" }]);
  });
});

describe("DEFAULT_BUTTONS", () => {
  it("is the starter set (PR) as config buttons", () => {
    expect(DEFAULT_BUTTONS.map((b) => b.id)).toEqual(["pr"]);
    // pr self-hides outside a repo (isGitRepo) and without an open PR (resolver), so it is never
    // noise — which is why it stayed a button while the directory ones became menu items.
    expect(DEFAULT_BUTTONS.find((b) => b.id === "pr")?.when).toBe("isGitRepo");
  });

  // GitHub's own pull-request shape, the same one the toolbar and the path menu draw. Resolved
  // through the renderer's own parser, so a misspelt name fails here instead of drawing as text.
  it("draws the PR button with GitHub's pull-request icon", () => {
    expect(githubIconOf(DEFAULT_BUTTONS.find((b) => b.id === "pr")?.icon)).toBe("git-pull-request");
  });

  // reveal / files / terminal / gh / pick-file are items in a session cell's PATH MENU now. As
  // buttons they were permanent icons for occasional file operations, and `reveal` duplicated the
  // path's own click outright. Pinned here so a well-meaning restore has to argue with this comment.
  it("no longer ships the directory / GitHub / picker buttons the path menu took over", () => {
    for (const id of ["reveal", "files", "terminal", "gh", "pick-file"]) expect(DEFAULT_BUTTONS.some((b) => b.id === id)).toBe(false);
  });
});

describe("sanitizeButtons open.pickFile", () => {
  it("keeps a run:open button whose only target is pickFile:true", () => {
    expect(sanitizeButtons([{ id: "p", label: "P", run: "open", open: { pickFile: true } }])).toEqual([
      { id: "p", label: "P", run: "open", open: { pickFile: true } },
    ]);
  });
  it("drops pickFile when not exactly true, leaving no valid target", () => {
    expect(sanitizeButtons([{ id: "p", label: "P", run: "open", open: { pickFile: "yes" } }])).toEqual([]);
  });
  it("keeps a run:open button whose target is a terminal dir", () => {
    expect(sanitizeButtons([{ id: "t", label: "T", run: "open", open: { terminal: "${dir}" } }])).toEqual([
      { id: "t", label: "T", run: "open", open: { terminal: "${dir}" } },
    ]);
  });
  it("keeps a run:open button whose target is pr:true", () => {
    expect(sanitizeButtons([{ id: "pr", label: "PR", run: "open", open: { pr: true } }])).toEqual([{ id: "pr", label: "PR", run: "open", open: { pr: true } }]);
  });
});

// `run: "action"` acts on the CELL the terminal is in (#1918). The list of actions is the server's,
// so a button naming one the client cannot dispatch must not survive the loader — it would draw and
// then do nothing, which is the failure the payload rule exists to prevent for the other run types.
describe("sanitizeButtons run:action", () => {
  it("keeps a button whose action is a known one", () => {
    expect(sanitizeButtons([{ id: "r", icon: "restart_alt", label: "Restart", run: "action", action: "restart" }])).toEqual([
      { id: "r", icon: "restart_alt", label: "Restart", run: "action", action: "terminal-restart" },
    ]);
  });
  it("keeps every action the client dispatches, and rewrites the old `restart` to its current name", () => {
    const kept = sanitizeButtons(HEADER_ACTIONS.map((action) => ({ id: action, label: action, run: "action", action })));
    expect(kept?.map((b) => ("action" in b ? b.action : null))).toEqual([...CELL_ACTIONS, "terminal-restart"]);
  });
  it("drops one naming an unknown action, or none at all", () => {
    expect(sanitizeButtons([{ id: "r", label: "R", run: "action", action: "reboot" }])).toEqual([]);
    expect(sanitizeButtons([{ id: "r", label: "R", run: "action" }])).toEqual([]);
  });
  it("does not accept another run type's payload in its place", () => {
    expect(sanitizeButtons([{ id: "r", label: "R", run: "action", cmd: "yarn build" }])).toEqual([]);
  });
  it("is not in the default set — nobody gets it who did not write it", () => {
    expect(DEFAULT_BUTTONS.some((b) => b.run === "action")).toBe(false);
  });
});

// A `buttons` entry with `items` is a folder: one row-2 icon opening a menu of buttons (#2366).
describe("sanitizeButtons folders", () => {
  const restart = { id: "restart", icon: "restart_alt", label: "Restart the agent", run: "action", action: "restart" };
  const test = { id: "test", icon: "science", label: "Run the tests", run: "shell", cmd: "yarn test" };
  const folderOf = (entry: HeaderEntry | undefined) => {
    if (!entry || !isHeaderFolder(entry)) throw new Error("expected a folder");
    return entry;
  };

  it("loads a folder with its children, icon, when and order", () => {
    const out = configured(sanitizeButtons([{ id: "ops", icon: "construction", label: "Operations", when: "isGitRepo", order: 5, items: [restart, test] }]));
    expect(out).toEqual([
      {
        id: "ops",
        icon: "construction",
        label: "Operations",
        when: "isGitRepo",
        order: 5,
        items: [
          { id: "restart", icon: "restart_alt", label: "Restart the agent", run: "action", action: "terminal-restart" },
          { id: "test", icon: "science", label: "Run the tests", run: "shell", cmd: "yarn test" },
        ],
      },
    ]);
  });

  // One level only: a child is loaded as a button, and a folder has no `run`, so it cannot load.
  it("drops a folder nested inside a folder", () => {
    const out = configured(sanitizeButtons([{ id: "ops", label: "Ops", items: [test, { id: "inner", label: "Inner", items: [restart] }] }]));
    expect(out).toHaveLength(1);
    expect(folderOf(out[0]).items.map((b) => b.id)).toEqual(["test"]);
  });

  it("drops a folder with no valid child, and one missing its id or label", () => {
    expect(sanitizeButtons([{ id: "ops", label: "Ops", items: [] }])).toEqual([]);
    expect(sanitizeButtons([{ id: "ops", label: "Ops", items: [{ id: "x", label: "X", run: "shell" }] }])).toEqual([]);
    expect(sanitizeButtons([{ label: "Ops", items: [test] }])).toEqual([]);
    expect(sanitizeButtons([{ id: "ops", items: [test] }])).toEqual([]);
  });

  // A shell button is re-resolved server-side BY ID, so an id must name exactly one button.
  it("keeps ids unique across folders and top-level buttons, top-level first", () => {
    const out = configured(
      sanitizeButtons([
        { id: "ops", label: "Ops", items: [test, { ...restart, id: "lint" }] },
        { id: "lint", label: "Lint", run: "shell", cmd: "yarn lint" },
        { id: "more", label: "More", items: [{ ...test, label: "Again" }] },
      ]),
    );
    expect(out.map((e) => e.id)).toEqual(["ops", "lint"]);
    expect(folderOf(out[0]).items.map((b) => b.id)).toEqual(["test"]);
  });

  it("re-applies id uniqueness after merging a project list over a global folder", () => {
    const merged = mergeHeaderConfig(
      { buttons: configured(sanitizeButtons([{ id: "ops", label: "Ops", items: [test, restart] }])), chips: null },
      { buttons: configured(sanitizeButtons([{ id: "test", label: "Test here", run: "shell", cmd: "yarn vitest" }])), chips: null },
    );
    const ops = configured(merged.buttons).find((e) => e.id === "ops");
    expect(folderOf(ops).items.map((b) => b.id)).toEqual(["restart"]);
  });
});

// #2465. Commands merge by id like buttons, and never share an id with a button.
describe("mergeHeaderConfig commands", () => {
  const shell = (id: string, cmd = "x") => ({ id, label: id, run: "shell" as const, cmd });

  it("lets the project override a global command by id, and keeps the rest", () => {
    const merged = mergeHeaderConfig(
      { buttons: null, chips: null, commands: [shell("a", "global"), shell("b")] },
      { buttons: null, chips: null, commands: [shell("a", "project")] },
    );
    expect(merged.commands?.map((c) => ("cmd" in c ? [c.id, c.cmd] : [c.id]))).toEqual([
      ["a", "project"],
      ["b", "x"],
    ]);
  });

  it("drops a command whose id a button has, including a default button's", () => {
    const merged = mergeHeaderConfig({ buttons: [shell("deploy")], chips: null, commands: [shell("deploy"), shell("other")] }, { buttons: null, chips: null });
    expect(merged.commands?.map((c) => c.id)).toEqual(["other"]);
    const onDefaults = mergeHeaderConfig({ buttons: null, chips: null, commands: [shell("pr"), shell("other")] }, { buttons: null, chips: null });
    expect(onDefaults.commands?.map((c) => c.id)).toEqual(["other"]);
  });

  it("reads commands from a config file, and none when absent", () => {
    expect(sanitizeHeaderConfig({ commands: [shell("a")] }).commands?.map((c) => c.id)).toEqual(["a"]);
    expect(sanitizeHeaderConfig({}).commands).toEqual([]);
  });
});
