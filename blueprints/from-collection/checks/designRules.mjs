// What the design step must leave in an app made from a collection, as pure rules over what the files say. The
// answer picks MulmoTerminal's own look or a template; a template is MulmoTerminal's classes with their colours and
// corners redefined, so every design is written with the same classes and only the template's @theme differs.

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
// Classes every screen in MulmoTerminal's look has: the main button and the icon font.
export const SIGNATURE_CLASSES = ["bg-indigo-600", "material-symbols-outlined"];

const TAILWIND_IMPORT = /@import\s+["']tailwindcss["']/u;
// Only what a file does counts, not what its comments say: a template's own header mentions the Tailwind import, and
// a class or an import left in a comment styles nothing. A `//` counts as a comment only at a line's start or after a
// space, so the `//` of a URL in a string is kept.
const withoutComments = (text) =>
  String(text)
    .replaceAll("\r\n", "\n")
    .replaceAll(/\/\*[\s\S]*?\*\//gu, "")
    .replaceAll(/<!--[\s\S]*?-->/gu, "")
    .replaceAll(/(^|\s)\/\/.*$/gmu, "$1");
const live = (files) => files.map((file) => ({ path: file.path, text: withoutComments(file.text) }));
const escaped = (text) => text.replaceAll(/[.*+?^${}()|[\]\\]/gu, "\\$&");
const MAIN_COLOUR_OVERRIDE = /--color-indigo-\d+\s*:/u;

/** The @theme block of a template file, as written; null when it has none. */
export const themeBlock = (text) => {
  const match = /@theme\s*\{[^}]*\}/u.exec(String(text).replaceAll("\r\n", "\n"));
  return match ? match[0] : null;
};

const dependencyProblems = (packageJson) => {
  const declared = { ...packageJson?.dependencies, ...packageJson?.devDependencies };
  const missing = PACKAGES.filter((name) => !Object.hasOwn(declared, name));
  return missing.length > 0 ? [`package.json does not depend on ${missing.join(", ")}`] : [];
};

// The plugin is imported under some name and that name is called, as `plugins: [tailwindcss()]` does.
const usesTailwindPlugin = (text) => {
  const imported = /import\s+([A-Za-z_$][\w$]*)\s+from\s+["']@tailwindcss\/vite["']/u.exec(text);
  return imported !== null && new RegExp(`\\b${escaped(imported[1])}\\s*\\(`, "u").test(text.slice(imported.index + imported[0].length));
};

const viteProblems = (viteConfigs) =>
  viteConfigs.some((config) => usesTailwindPlugin(config.text)) ? [] : ["no vite.config uses @tailwindcss/vite: add tailwindcss() to its plugins"];

// The template's block must be in the stylesheet that imports Tailwind, or in a file that stylesheet imports.
const themeProblems = (design, styles, template) => {
  const entries = styles.filter((style) => TAILWIND_IMPORT.test(style.text));
  if (entries.length === 0) return ['no stylesheet has @import "tailwindcss"'];
  if (design.theme === null) {
    const overriding = styles.filter((style) => MAIN_COLOUR_OVERRIDE.test(style.text)).map((style) => style.path);
    return overriding.length > 0 ? [`${overriding.join(", ")} redefines the indigo colours; MulmoTerminal's look keeps Tailwind's own`] : [];
  }
  const block = themeBlock(template);
  const holders = styles.filter((style) => block !== null && style.text.includes(block));
  const imported = (holder) =>
    entries.some((entry) => entry === holder || new RegExp(`@import\\s+["'](?:[^"']*/)?${escaped(holder.path.split("/").pop())}["']`, "u").test(entry.text));
  if (holders.length === 0) return [`no stylesheet holds design/themes/${design.theme}.css unchanged`];
  return holders.some(imported) ? [] : [`${holders[0].path} holds the template but no stylesheet that imports tailwindcss imports it`];
};

const classProblems = (sources, icon) => {
  const text = sources.map((source) => source.text).join("\n");
  const missing = SIGNATURE_CLASSES.filter((name) => !text.includes(name));
  const iconProblem = icon && !text.includes(icon) ? [`the screens never show the collection's icon "${icon}"`] : [];
  const quoted = missing.map((name) => JSON.stringify(name)).join(", ");
  return [...(missing.length > 0 ? [`the screens never use ${quoted}`] : []), ...iconProblem];
};

const recordProblems = (design, designMd) => {
  if (designMd === null) return ["DESIGN.md is missing: it tells later steps which design the screens follow"];
  return designMd.includes(design.option) ? [] : [`DESIGN.md does not name the design "${design.option}"`];
};

/**
 * Every way the app falls short of the chosen design. `styles`, `sources` and `viteConfigs` are { path, text }; `icon` is
 * the starting collection's icon (may be missing); `template` is the chosen template's text.
 */
export function designProblems({ answer, packageJson, viteConfigs, styles, sources, designMd, icon, template }) {
  const design = designOf(answer);
  if (design === null) return [`.blueprint/answers.json: the design "${answer}" is not one this pack has`];
  return [
    ...dependencyProblems(packageJson),
    ...viteProblems(live(viteConfigs)),
    ...themeProblems(design, live(styles), template),
    ...classProblems(live(sources), icon),
    ...recordProblems(design, designMd),
  ];
}
