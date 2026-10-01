// @vitest-environment node
// The design step of the from-collection pack: the answers the question offers, the templates they take, and what the
// check holds an app to for each. The built CSS here is written the way Vite minifies Tailwind's output.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import {
  DESIGNS,
  SAME_AS_MULMOTERMINAL,
  canonicalValue,
  declarations,
  designOf,
  designProblems,
} from "../../../blueprints/from-collection/checks/designRules.mjs";

const PACK = path.join(import.meta.dirname, "..", "..", "..", "blueprints", "from-collection");
const readPack = (file: string): string => readFileSync(path.join(PACK, file), "utf8");
const template = (theme: string): string => readPack(`design/themes/${theme}.css`);
const TAILWIND_THEME = readFileSync(createRequire(import.meta.url).resolve("tailwindcss/theme.css"), "utf8");

interface HearingQuestion {
  id: string;
  options?: string[];
  default?: string;
}
const isHearing = (value: unknown): value is { questions: HearingQuestion[] } =>
  typeof value === "object" && value !== null && "questions" in value && Array.isArray(value.questions);
const hearing: unknown = JSON.parse(readPack("hearing.json"));
const designQuestion = isHearing(hearing) ? hearing.questions.find((question) => question.id === "design") : undefined;

// A value as Vite's minifier writes it: oklch's lightness as a percentage, no leading zeros.
const minified = (value: string): string =>
  value.replace(/^oklch\(0\.(\d+)/u, (_match, digits: string) => "oklch(" + Number("0." + digits) * 100 + "%").replaceAll(/(^|[\s(])0\./gu, "$1.");
const tokenValue = (css: string, name: string): string => declarations(css).find((token) => token.name === name)?.value ?? "";
// A build's stylesheet holding these tokens, MulmoTerminal's main button and the icon font.
const built = (source: string, names = ["--color-indigo-600", "--color-slate-50", "--radius-lg"]): string =>
  [
    "@layer theme{:root,:host{" + names.map((name) => name + ":" + minified(tokenValue(source, name))).join(";") + "}}",
    ".bg-indigo-600{background-color:var(--color-indigo-600)}",
    '@font-face{font-family:"Material Symbols Outlined";src:url(./x.woff2)}',
  ].join("");

const SCREEN = {
  path: "client/src/App.vue",
  text: `<button class="bg-indigo-600 text-white"><span class="material-symbols-outlined">menu_book</span></button>`,
};

// An app that follows MulmoTerminal's look for a collection with a book icon.
const followingApp = {
  answer: SAME_AS_MULMOTERMINAL,
  packageJson: { devDependencies: { tailwindcss: "^4", "@tailwindcss/vite": "^4", "material-symbols": "^0.40" } },
  builtCss: built(TAILWIND_THEME),
  tailwindTheme: TAILWIND_THEME,
  template: null,
  sources: [SCREEN],
  designMd: `# Design\n\n${SAME_AS_MULMOTERMINAL}\n`,
  icon: "menu_book",
};

describe("the design question", () => {
  it("offers exactly the designs the check knows, MulmoTerminal's first and by default", () => {
    expect(designQuestion?.options).toEqual(DESIGNS.map((design) => design.option));
    expect(designQuestion?.default).toBe(SAME_AS_MULMOTERMINAL);
    expect(DESIGNS[0]).toEqual({ option: SAME_AS_MULMOTERMINAL, theme: null });
  });

  it("has a template file defining the main colour for every template it names", () => {
    DESIGNS.flatMap((design) => (design.theme ? [design.theme] : [])).forEach((theme) => {
      expect(tokenValue(template(theme), "--color-indigo-600"), theme).toMatch(/^oklch\(/u);
    });
  });

  it("has templates that differ from each other", () => {
    const blocks = DESIGNS.flatMap((design) => (design.theme ? [tokenValue(template(design.theme), "--color-indigo-600")] : []));
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

describe("canonicalValue", () => {
  it("reads a minified value as the one written", () => {
    expect(canonicalValue("oklch(52% .13 35)")).toBe(canonicalValue("oklch(0.52 0.13 35)"));
    expect(canonicalValue(".875rem")).toBe(canonicalValue("0.875rem"));
    expect(canonicalValue("oklch(51.1% .262 276.966)")).toBe(canonicalValue("oklch(51.1% 0.262 276.966)"));
  });

  it("tells different values apart", () => {
    expect(canonicalValue("oklch(52% .13 35)")).not.toBe(canonicalValue("oklch(0.52 0.13 36)"));
    expect(canonicalValue("1rem")).not.toBe(canonicalValue("1px"));
    expect(canonicalValue("#fff")).toBe("#fff");
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

  it("needs a build", () => {
    expect(designProblems({ ...followingApp, builtCss: null })).toEqual(["no built CSS under dist/: yarn build did not produce the app's stylesheet"]);
  });

  it("needs Tailwind to have made the main button's rule, whatever the sources or their comments say", () => {
    const untouched = "body{margin:0}/* .bg-indigo-600{} */";
    const problems = designProblems({ ...followingApp, builtCss: untouched });
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("the built CSS has no .bg-indigo-600 rule");
  });

  it("needs the icon font in the build", () => {
    const fontless = built(TAILWIND_THEME).replace(/@font-face\{[^}]*\}/u, "");
    expect(designProblems({ ...followingApp, builtCss: fontless })).toEqual([
      "the built CSS has no Material Symbols Outlined font: import material-symbols/outlined.css where the app starts",
    ]);
  });

  it("refuses MulmoTerminal's look with a colour or a corner redefined", () => {
    const redefined = `${built(TAILWIND_THEME)}:root{--color-indigo-600:oklch(52% .13 35);--radius-lg:2rem}`;
    const [problem] = designProblems({ ...followingApp, builtCss: redefined });
    expect(problem).toBe(
      "the built CSS gives --color-indigo-600, --radius-lg other values than Tailwind's own: MulmoTerminal's look redefines no colour or corner, so remove the @theme that sets them",
    );
  });

  it("says when the design's colours cannot be read", () => {
    expect(designProblems({ ...followingApp, tailwindTheme: null })).toEqual(["cannot read the design's colours (node_modules/tailwindcss/theme.css)"]);
  });

  it("needs the icon font's class and the collection's icon in the screens, comments aside", () => {
    const commented = [{ path: "a.vue", text: '<!-- <span class="material-symbols-outlined"> -->\n// menu_book\n/* menu_book */' }];
    expect(designProblems({ ...followingApp, sources: commented })).toEqual([
      'the screens never use "material-symbols-outlined"',
      'the screens never show the collection\'s icon "menu_book"',
    ]);
    expect(designProblems({ ...followingApp, sources: [{ path: "a.vue", text: '<span class="material-symbols-outlined">add</span>' }], icon: null })).toEqual(
      [],
    );
  });

  it("keeps the // of a URL in a string", () => {
    const linked = { path: "b.vue", text: `<a href="https://example.com"><span class="material-symbols-outlined">menu_book</span></a>` };
    expect(designProblems({ ...followingApp, sources: [linked] })).toEqual([]);
  });

  it("needs DESIGN.md naming the design", () => {
    expect(designProblems({ ...followingApp, designMd: null })).toEqual(["DESIGN.md is missing: it tells later steps which design the screens follow"]);
    expect(designProblems({ ...followingApp, designMd: "# Design\n" })).toEqual([`DESIGN.md does not name the design "${SAME_AS_MULMOTERMINAL}"`]);
  });

  describe("with a template", () => {
    const soft = DESIGNS.find((design) => design.theme === "soft");
    const answer = soft?.option ?? "";
    const withTemplate = {
      ...followingApp,
      answer,
      template: template("soft"),
      designMd: answer,
      builtCss: built(template("soft"), ["--color-indigo-600", "--color-slate-50", "--color-white", "--radius-lg"]),
    };

    it("passes a build that carries the template's values", () => {
      expect(designProblems(withTemplate)).toEqual([]);
    });

    it("refuses a build that kept Tailwind's own colours: the template was not imported", () => {
      const [problem] = designProblems({ ...withTemplate, builtCss: built(TAILWIND_THEME) });
      expect(problem).toContain("other values than design/themes/soft.css");
    });

    it("refuses another template, and a template changed by one value", () => {
      expect(designProblems({ ...withTemplate, builtCss: built(template("calm")) })[0]).toContain("design/themes/soft.css");
      const edited = withTemplate.builtCss.replace("--radius-lg:.875rem", "--radius-lg:.9rem");
      expect(edited).not.toBe(withTemplate.builtCss);
      expect(designProblems({ ...withTemplate, builtCss: edited })).toEqual([
        'the built CSS gives --radius-lg other values than design/themes/soft.css: import it right after "tailwindcss", unchanged, and redefine nothing else',
      ]);
    });

    it("says when the template cannot be read", () => {
      expect(designProblems({ ...withTemplate, template: null })).toEqual(["cannot read the design's colours (design/themes/soft.css)"]);
    });
  });
});
