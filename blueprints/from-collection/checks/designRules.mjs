// What the design step must leave in an app made from a collection. The answer picks MulmoTerminal's own look or a
// template; a template is MulmoTerminal's classes with their colours and corners redefined, so every design is written
// with the same classes and only the template's @theme differs. Whether Tailwind runs and which colours won is read
// from the BUILT CSS, not from the sources: a build is what the person gets, and no comment or stray import can fake it.

export const SAME_AS_MULMOTERMINAL = "MulmoTerminal と同じ";

/** The design answers, each with the template under design/themes/ it takes (none for MulmoTerminal's own). */
export const DESIGNS = [
  { option: SAME_AS_MULMOTERMINAL, theme: null },
  { option: "やわらかい（暖かい紙の色・丸い角）", theme: "soft" },
  { option: "くっきり（白と黒・小さな角）", theme: "crisp" },
  { option: "落ち着いた（深い緑・やさしい灰色）", theme: "calm" },
];

/** The design an answer names; an unanswered question takes MulmoTerminal's, as the question's default does. */
export const designOf = (answer) => DESIGNS.find((design) => design.option === (answer ?? SAME_AS_MULMOTERMINAL)) ?? null;

const PACKAGES = ["tailwindcss", "@tailwindcss/vite", "material-symbols"];
// The main button of MulmoTerminal's look, as Tailwind writes it: present only when Tailwind ran over screens using it.
const MAIN_BUTTON_RULE = /\.bg-indigo-600\s*\{\s*background-color:\s*var\(--color-indigo-600\)/u;
// One class per screen of MulmoTerminal's look that no other screen uses, from design/mulmoterminal.md. Tailwind writes
// a rule only for a class some screen uses, so a screen left in its own look shows up as its class missing.
export const SCREEN_ANCHORS = [
  { screen: "header (the icon box)", className: "border-indigo-100" },
  { screen: "toolbar (its bar)", className: "border-slate-100" },
  { screen: "list (the table body)", className: "divide-slate-100" },
  { screen: "record panel (its backdrop)", className: "bg-slate-900/40" },
  { screen: "kanban (its columns)", className: "w-72", when: "kanban" },
  { screen: "calendar (its day cells)", className: "min-h-[5.5rem]", when: "calendar" },
];
// A class name as a CSS selector writes it: `bg-slate-900/40` is `.bg-slate-900\/40`.
const selectorOf = (className) => "." + className.replaceAll(/[^\w-]/gu, (character) => "\\" + character);
// The selector followed by something that ends a class name, so `.w-72` is not found in `.w-720`.
const hasRule = (css, className) =>
  css
    .split(selectorOf(className))
    .slice(1)
    .some((rest) => !/^[\w-]/u.test(rest));
const ICON_FONT = /font-family:\s*["']?Material Symbols Outlined/u;
// The tokens a template redefines; the ones the build kept must hold the chosen design's values.
const DESIGN_TOKEN = /^--(?:color-(?:indigo|slate|gray)-\d+|color-white|radius-[\w-]+)$/u;

// A class or an icon name left in a comment shows nothing. A `//` counts as a comment only at a line's start or after
// a space, so the `//` of a URL in a string is kept.
const withoutComments = (text) =>
  String(text)
    .replaceAll("\r\n", "\n")
    .replaceAll(/\/\*[\s\S]*?\*\//gu, "")
    .replaceAll(/<!--[\s\S]*?-->/gu, "")
    .replaceAll(/(^|\s)\/\/.*$/gmu, "$1");

/** A CSS value as minification leaves it comparable: `oklch(0.52 0.13 35)` and `oklch(52% .13 35)` are one value. */
export const canonicalValue = (value) => {
  const text = String(value).trim().toLowerCase();
  const oklch = /^oklch\(\s*([\d.]+)(%?)\s+([\d.]+)\s+([\d.]+)\s*\)$/u.exec(text);
  if (oklch) return `oklch(${Number(oklch[1]) / (oklch[2] ? 100 : 1)} ${Number(oklch[3])} ${Number(oklch[4])})`;
  const length = /^([\d.]+)([a-z%]*)$/u.exec(text);
  return length ? `${Number(length[1])}${length[2]}` : text.replaceAll(/\s+/gu, "");
};

/** Every `--name: value` a stylesheet declares, comments aside, in order (a name may repeat). */
export const declarations = (css) =>
  withoutComments(css)
    .split(/[;{}]/u)
    .map((part) => part.trim())
    .filter((part) => part.startsWith("--") && part.includes(":"))
    .map((part) => ({ name: part.slice(0, part.indexOf(":")).trim(), value: part.slice(part.indexOf(":") + 1).trim() }));

const dependencyProblems = (packageJson) => {
  const declared = { ...packageJson?.dependencies, ...packageJson?.devDependencies };
  const missing = PACKAGES.filter((name) => !Object.hasOwn(declared, name));
  return missing.length > 0 ? [`package.json does not depend on ${missing.join(", ")}`] : [];
};

// The values each design token must have in the build: the template's, or Tailwind's own theme for MulmoTerminal's.
const expectedTokens = (design, template, tailwindTheme) =>
  new Map(
    declarations(design.theme === null ? tailwindTheme : template)
      .filter((token) => DESIGN_TOKEN.test(token.name))
      .map((token) => [token.name, canonicalValue(token.value)]),
  );

function tokenProblems(design, builtCss, expected) {
  const built = declarations(builtCss);
  if (!built.some((token) => token.name === "--color-indigo-600"))
    return ["the built CSS does not define --color-indigo-600: Tailwind's theme is not in the build"];
  const wrong = built.filter((token) => expected.has(token.name) && canonicalValue(token.value) !== expected.get(token.name));
  const names = [...new Set(wrong.map((token) => token.name))];
  if (names.length === 0) return [];
  const given = `the built CSS gives ${names.join(", ")} other values than`;
  return design.theme === null
    ? [`${given} Tailwind's own: MulmoTerminal's look redefines no colour or corner, so remove the @theme that sets them`]
    : [`${given} design/themes/${design.theme}.css: import it right after "tailwindcss", unchanged, and redefine nothing else`];
}

function builtProblems(design, builtCss, template, tailwindTheme, views) {
  if (builtCss === null) return ["no built CSS under dist/: yarn build did not produce the app's stylesheet"];
  const css = withoutComments(builtCss);
  if (!MAIN_BUTTON_RULE.test(css)) {
    return [
      "the built CSS has no .bg-indigo-600 rule as Tailwind writes it: Tailwind is not running in the build (tailwindcss() in vite.config's plugins, @import \"tailwindcss\" in the stylesheet), or no screen uses MulmoTerminal's main button",
    ];
  }
  const expected = expectedTokens(design, template, tailwindTheme);
  const source = design.theme === null ? "node_modules/tailwindcss/theme.css" : `design/themes/${design.theme}.css`;
  if (!expected.has("--color-indigo-600")) return [`cannot read the design's colours (${source})`];
  const missing = SCREEN_ANCHORS.filter((anchor) => (!anchor.when || views[anchor.when]) && !hasRule(css, anchor.className));
  return [
    ...missing.map((anchor) => `the ${anchor.screen} is not in MulmoTerminal's look: no screen uses "${anchor.className}" (design/mulmoterminal.md)`),
    ...(ICON_FONT.test(css) ? [] : ["the built CSS has no Material Symbols Outlined font: import material-symbols/outlined.css where the app starts"]),
    ...tokenProblems(design, builtCss, expected),
  ];
}

const usageProblems = (sources, icon) => {
  const text = sources.map((source) => withoutComments(source.text)).join("\n");
  return [
    ...(text.includes("material-symbols-outlined") ? [] : ['the screens never use "material-symbols-outlined"']),
    ...(icon && !text.includes(icon) ? [`the screens never show the collection's icon "${icon}"`] : []),
  ];
};

const recordProblems = (design, designMd) => {
  if (designMd === null) return ["DESIGN.md is missing: it tells later steps which design the screens follow"];
  return designMd.includes(design.option) ? [] : [`DESIGN.md does not name the design "${design.option}"`];
};

/**
 * Every way the app falls short of the chosen design. `builtCss` is the build's stylesheets joined (null when there
 * are none); `tailwindTheme` is the app's node_modules/tailwindcss/theme.css; `template` the chosen template's text;
 * `sources` the screens' files as { path, text }; `icon` the starting collection's icon (may be missing); `views` says
 * whether the collection has a kanban and a calendar ({ kanban, calendar }).
 */
export function designProblems({ answer, packageJson, builtCss, tailwindTheme, template, sources, designMd, icon, views }) {
  const design = designOf(answer);
  if (design === null) return [`.blueprint/answers.json: the design "${answer}" is not one this pack has`];
  return [
    ...dependencyProblems(packageJson),
    ...builtProblems(design, builtCss, template, tailwindTheme, views ?? {}),
    ...usageProblems(sources, icon),
    ...recordProblems(design, designMd),
  ];
}
