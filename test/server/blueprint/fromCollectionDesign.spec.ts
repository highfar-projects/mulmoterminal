// @vitest-environment node
// The design step of the from-collection pack: the answers the question offers, the templates they take, and what the
// check holds an app to for each.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  DESIGNS,
  SAME_AS_MULMOTERMINAL,
  SIGNATURE_CLASSES,
  designOf,
  designProblems,
  themeBlock,
} from "../../../blueprints/from-collection/checks/designRules.mjs";

const PACK = path.join(import.meta.dirname, "..", "..", "..", "blueprints", "from-collection");
const readPack = (file: string): string => readFileSync(path.join(PACK, file), "utf8");
const template = (theme: string): string => readPack(`design/themes/${theme}.css`);

interface HearingQuestion {
  id: string;
  options?: string[];
  default?: string;
}
const isHearing = (value: unknown): value is { questions: HearingQuestion[] } =>
  typeof value === "object" && value !== null && "questions" in value && Array.isArray(value.questions);
const hearing: unknown = JSON.parse(readPack("hearing.json"));
const designQuestion = isHearing(hearing) ? hearing.questions.find((question) => question.id === "design") : undefined;

const TAILWIND_ENTRY = { path: "client/src/style.css", text: '@import "tailwindcss";\n' };
const SCREEN = { path: "client/src/App.vue", text: `<button class="bg-indigo-600 text-white"><span class="material-symbols-outlined">add</span></button>` };
const HEADER = { path: "client/src/Header.vue", text: `<div class="bg-indigo-50"><span class="material-symbols-outlined">menu_book</span></div>` };

// An app that follows MulmoTerminal's look for a collection with a book icon.
const followingApp = {
  answer: SAME_AS_MULMOTERMINAL,
  packageJson: { devDependencies: { tailwindcss: "^4", "@tailwindcss/vite": "^4", "material-symbols": "^0.40" } },
  viteConfigs: [{ path: "vite.config.ts", text: 'import tailwindcss from "@tailwindcss/vite";\nplugins: [vue(), tailwindcss()]' }],
  styles: [TAILWIND_ENTRY],
  sources: [SCREEN, HEADER],
  designMd: `# Design\n\n${SAME_AS_MULMOTERMINAL}\n`,
  icon: "menu_book",
  template: null,
};

describe("the design question", () => {
  it("offers exactly the designs the check knows, MulmoTerminal's first and by default", () => {
    expect(designQuestion?.options).toEqual(DESIGNS.map((design) => design.option));
    expect(designQuestion?.default).toBe(SAME_AS_MULMOTERMINAL);
    expect(DESIGNS[0]).toEqual({ option: SAME_AS_MULMOTERMINAL, theme: null });
  });

  it("has a template file with an @theme block for every template it names", () => {
    DESIGNS.flatMap((design) => (design.theme ? [design.theme] : [])).forEach((theme) => {
      expect(themeBlock(template(theme)), theme).toMatch(/--color-indigo-600:/u);
    });
  });

  it("has templates that differ from each other", () => {
    const blocks = DESIGNS.flatMap((design) => (design.theme ? [themeBlock(template(design.theme))] : []));
    expect(new Set(blocks).size).toBe(blocks.length);
  });

  it("is spelled out in the spec the hearing fills", () => {
    expect(readPack("spec/requirements.md")).toContain("{{design}}");
  });
});

describe("designOf", () => {
  it("takes MulmoTerminal's look when the question was not answered", () => {
    expect(designOf(undefined)?.theme).toBeNull();
  });

  it("finds each template by its answer, and nothing for an answer the pack does not have", () => {
    expect(designOf("くっきり（白と黒・小さな角）")?.theme).toBe("crisp");
    expect(designOf("くっきり")).toBeNull();
  });
});

describe("designProblems", () => {
  it("passes an app that follows MulmoTerminal's look", () => {
    expect(designProblems(followingApp)).toEqual([]);
  });

  it("names an answer the pack does not have", () => {
    expect(designProblems({ ...followingApp, answer: "派手" })).toEqual(['.blueprint/answers.json: the design "派手" is not one this pack has']);
  });

  it("names every package that is missing, whether in dependencies or devDependencies", () => {
    expect(designProblems({ ...followingApp, packageJson: { dependencies: { tailwindcss: "^4" } } })).toEqual([
      "package.json does not depend on @tailwindcss/vite, material-symbols",
    ]);
    expect(designProblems({ ...followingApp, packageJson: null })[0]).toContain("tailwindcss, @tailwindcss/vite, material-symbols");
  });

  it("needs the Tailwind plugin in a vite config", () => {
    expect(designProblems({ ...followingApp, viteConfigs: [{ path: "vite.config.ts", text: "plugins: [vue()]" }] })).toEqual([
      "no vite.config uses @tailwindcss/vite: add tailwindcss() to its plugins",
    ]);
    expect(designProblems({ ...followingApp, viteConfigs: [] })).toHaveLength(1);
  });

  it("takes the plugin under any name, and not one that is only imported or only in a comment", () => {
    const vite = (text: string) => designProblems({ ...followingApp, viteConfigs: [{ path: "vite.config.ts", text }] });
    expect(vite('import tw from "@tailwindcss/vite";\nexport default { plugins: [tw()] };')).toEqual([]);
    expect(vite('import tailwindcss from "@tailwindcss/vite";\nexport default { plugins: [] };')).toHaveLength(1);
    expect(vite('// import tailwindcss from "@tailwindcss/vite";\nplugins: [tailwindcss()]')).toHaveLength(1);
    expect(vite('/* import tailwindcss from "@tailwindcss/vite"; tailwindcss() */')).toHaveLength(1);
  });

  it("does not count what only a comment says", () => {
    const commented = [{ path: "a.vue", text: '<!-- <button class="bg-indigo-600"> -->\n// material-symbols-outlined menu_book\n/* menu_book */' }];
    expect(designProblems({ ...followingApp, sources: commented })).toEqual([
      'the screens never use "bg-indigo-600", "material-symbols-outlined"',
      'the screens never show the collection\'s icon "menu_book"',
    ]);
    expect(designProblems({ ...followingApp, styles: [{ path: "a.css", text: '/* @import "tailwindcss"; */' }] })).toEqual([
      'no stylesheet has @import "tailwindcss"',
    ]);
  });

  it("keeps the // of a URL in a string", () => {
    const linked = { path: "b.vue", text: `<a href="https://example.com" class="bg-indigo-600"><span class="material-symbols-outlined">menu_book</span></a>` };
    expect(designProblems({ ...followingApp, sources: [linked] })).toEqual([]);
  });

  it("needs a stylesheet that imports Tailwind", () => {
    expect(designProblems({ ...followingApp, styles: [{ path: "a.css", text: "body { margin: 0 }" }] })).toEqual(['no stylesheet has @import "tailwindcss"']);
  });

  it("refuses redefined colours in MulmoTerminal's look", () => {
    const styles = [TAILWIND_ENTRY, { path: "theme.css", text: "@theme { --color-indigo-600: red; }" }];
    expect(designProblems({ ...followingApp, styles })).toEqual(["theme.css redefines the indigo colours; MulmoTerminal's look keeps Tailwind's own"]);
  });

  it("names each signature class the screens never use", () => {
    expect(designProblems({ ...followingApp, sources: [{ path: "a.vue", text: "menu_book" }] })).toEqual([
      'the screens never use "bg-indigo-600", "material-symbols-outlined"',
    ]);
    expect(SIGNATURE_CLASSES).toContain("material-symbols-outlined");
  });

  it("needs the collection's icon, and asks for none when the collection has none", () => {
    expect(designProblems({ ...followingApp, sources: [SCREEN] })).toEqual(['the screens never show the collection\'s icon "menu_book"']);
    expect(designProblems({ ...followingApp, sources: [SCREEN], icon: null })).toEqual([]);
  });

  it("needs DESIGN.md naming the design", () => {
    expect(designProblems({ ...followingApp, designMd: null })).toEqual(["DESIGN.md is missing: it tells later steps which design the screens follow"]);
    expect(designProblems({ ...followingApp, designMd: "# Design\n" })).toEqual([`DESIGN.md does not name the design "${SAME_AS_MULMOTERMINAL}"`]);
  });

  describe("with a template", () => {
    const soft = DESIGNS.find((design) => design.theme === "soft");
    const answer = soft?.option ?? "";
    const withTemplate = { ...followingApp, answer, template: template("soft"), designMd: answer };

    it("passes the template copied into the stylesheet that imports Tailwind", () => {
      expect(designProblems({ ...withTemplate, styles: [{ path: "style.css", text: `@import "tailwindcss";\n${template("soft")}` }] })).toEqual([]);
    });

    it("does not take the template's own comment, which mentions the Tailwind import, for an import", () => {
      expect(template("soft")).toContain('@import "tailwindcss"');
      expect(designProblems({ ...withTemplate, styles: [{ path: "src/soft.css", text: template("soft") }] })).toEqual([
        'no stylesheet has @import "tailwindcss"',
      ]);
    });

    it("passes the template copied to its own file that the entry imports, with CRLF line ends", () => {
      const styles = [
        { path: "src/style.css", text: '@import "tailwindcss";\n@import "./soft.css";\n' },
        { path: "src/soft.css", text: template("soft").replaceAll("\n", "\r\n") },
      ];
      expect(designProblems({ ...withTemplate, styles })).toEqual([]);
    });

    it("refuses a template that is not imported, changed, or another one", () => {
      const notImported = [TAILWIND_ENTRY, { path: "src/soft.css", text: template("soft") }];
      expect(designProblems({ ...withTemplate, styles: notImported })).toEqual([
        "src/soft.css holds the template but no stylesheet that imports tailwindcss imports it",
      ]);
      const changed = [{ path: "style.css", text: `@import "tailwindcss";\n${template("soft").replace("0.975", "0.97")}` }];
      expect(designProblems({ ...withTemplate, styles: changed })).toEqual(["no stylesheet holds design/themes/soft.css unchanged"]);
      const commentedImport = [
        { path: "src/style.css", text: '@import "tailwindcss";\n/* @import "./soft.css"; */\n' },
        { path: "src/soft.css", text: template("soft") },
      ];
      expect(designProblems({ ...withTemplate, styles: commentedImport })).toEqual([
        "src/soft.css holds the template but no stylesheet that imports tailwindcss imports it",
      ]);
      const commentedOut = [{ path: "style.css", text: `@import "tailwindcss";\n/* ${themeBlock(template("soft"))} */` }];
      expect(designProblems({ ...withTemplate, styles: commentedOut })).toEqual(["no stylesheet holds design/themes/soft.css unchanged"]);
      const other = [{ path: "style.css", text: `@import "tailwindcss";\n${template("calm")}` }];
      expect(designProblems({ ...withTemplate, styles: other })).toEqual(["no stylesheet holds design/themes/soft.css unchanged"]);
    });
  });
});
