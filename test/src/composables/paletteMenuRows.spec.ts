// #2697. The acting terminal's Run-menu scripts and Skill-menu skills as command-palette rows.
import { describe, it, expect } from "vitest";
import { isMenuRow, menuCandidates, menuRow } from "../../../src/composables/paletteMenuRows";
import { paletteRows, rowKey, type PaletteSources, type PaletteText } from "../../../src/composables/commandPaletteRows";
import { isRemembered } from "../../../src/composables/paletteFrecency";

const MENU_TEXT = { runScript: (label: string) => `Run: ${label}`, runSkill: (slug: string) => `Skill: /${slug}` };
const SCRIPTS = [
  { index: 0, label: "dev", command: "yarn dev" },
  { index: 1, label: "dev", command: "yarn dev --host" },
];
const SKILLS = [{ slug: "review", description: "Reviews the diff" }];

const TEXT: PaletteText = {
  ...MENU_TEXT,
  label: (action) => `Label of ${action}`,
  description: (action) => `About ${action}`,
  needsEnlarged: "",
  needsNothingEnlarged: "",
  needsManualOrder: "",
  needsFilesPane: "",
  gridHidden: "",
  screenLabel: (screen) => `Screen ${screen}`,
  screenDescription: (screen) => `Open ${screen}`,
  settingsLabel: (tab) => `Section ${tab}`,
  openInSettings: "",
  fromCollection: "",
  newTerminalIn: (dir) => `New in ${dir}`,
  launchDetail: "",
  gridFull: "",
  startAgent: (agent) => `Start ${agent}`,
  runLauncher: (label) => `Launch ${label}`,
  startDetail: (dir) => `in ${dir}`,
  resumeLabel: (title) => `Resume ${title}`,
  wikiPage: (title) => `Wiki ${title}`,
  wikiDetail: "",
  promptLabel: (line) => `Prompt ${line}`,
  promptDetail: "",
  githubItem: (kind, number, title) => `${kind} #${number}: ${title}`,
  handoff: (action, query) => `${action} ${query}`,
  resumeDetail: () => "",
  currentChoice: "",
  switchChoice: "",
  scopeLabel: (kind) => `Only ${kind}`,
};
const SOURCES: PaletteSources = {
  screens: [],
  terminals: [{ uid: 3, path: "Run dev", keywords: "", detail: "" }],
  settings: [],
  choices: [],
  commands: [],
  collectionActions: [],
  launchDirs: [],
  starts: [],
  startDir: null,
  resumes: [],
  wikiPages: [],
  githubItems: [],
  prompts: [],
  scripts: SCRIPTS,
  skills: SKILLS,
  frecency: () => 0,
  aliases: {},
  favorites: [],
  gridFull: false,
};
const STATE = { zoomed: false, available: true, manualOrder: true, filesOpen: false };
const keysFor = (query: string, sources: PaletteSources = SOURCES): string[] => paletteRows(query, {}, STATE, TEXT, sources).map(rowKey);

describe("menuCandidates / menuRow", () => {
  it("names a script `Run: <label>` and a skill `Skill: /<slug>`, keeping two alike scripts apart", () => {
    const candidates = menuCandidates(SCRIPTS, SKILLS, MENU_TEXT);
    expect(candidates.map(([, candidate]) => candidate.name)).toEqual(["Run: dev", "Run: dev", "Skill: /review"]);
    expect(new Set(candidates.map(([search]) => search)).size).toBe(candidates.length);
  });

  it("searches a script's command as well as its name", () => {
    const [search] = menuCandidates(SCRIPTS, [], MENU_TEXT)[1] ?? [""];
    expect(search).toContain("yarn dev --host");
  });

  it("describes a script by its command and a skill by its description, with the menus' icons", () => {
    const rows = menuCandidates(SCRIPTS, SKILLS, MENU_TEXT).map(([, candidate]) => menuRow(candidate, []));
    expect(rows.map((row) => [row.kind, row.icon, row.description, row.disabledReason])).toEqual([
      ["script", "play_arrow", "yarn dev", null],
      ["script", "play_arrow", "yarn dev --host", null],
      ["skill", "bolt", "Reviews the diff", null],
    ]);
  });

  it("keys a script by its index and a skill by its slug, and claims no other row", () => {
    const [script, , skill] = menuCandidates(SCRIPTS, SKILLS, MENU_TEXT).map(([, candidate]) => menuRow(candidate, []));
    expect(script && rowKey(script)).toBe("script:0");
    expect(skill && rowKey(skill)).toBe("skill:review");
    expect(isMenuRow({ kind: "wiki", slug: "a", icon: "", label: [], description: "", disabledReason: null })).toBe(false);
  });
});

describe("the palette's script and skill rows", () => {
  it("lists them unfiltered and under `>`, the runs scope", () => {
    expect(keysFor("")).toEqual(expect.arrayContaining(["script:0", "script:1", "skill:review"]));
    expect(keysFor(">run dev")).toEqual(expect.arrayContaining(["script:0", "script:1"]));
    expect(keysFor(">review")).toContain("skill:review");
  });

  it("keeps two scripts with the same name and command as two rows", () => {
    const twins = [
      { index: 0, label: "dev", command: "yarn dev" },
      { index: 1, label: "dev", command: "yarn dev" },
    ];
    expect(keysFor(">dev", { ...SOURCES, scripts: twins })).toEqual(expect.arrayContaining(["script:0", "script:1"]));
  });

  it("leaves them out of another scope", () => {
    const keys = keysFor("@run dev");
    expect(keys).toContain("terminal:3");
    expect(keys.filter((key) => key.startsWith("script:") || key.startsWith("skill:"))).toEqual([]);
  });

  it("lists none when the acting terminal offers no menus", () => {
    expect(keysFor(">", { ...SOURCES, scripts: [], skills: [] }).filter((key) => key.startsWith("script:") || key.startsWith("skill:"))).toEqual([]);
  });

  it("does not remember a pick, since the key names a different entry in another directory", () => {
    const rows = paletteRows(">", {}, STATE, TEXT, SOURCES).filter((row) => row.kind === "script" || row.kind === "skill");
    expect(rows).toHaveLength(3);
    expect(rows.map(isRemembered)).toEqual([false, false, false]);
  });
});
