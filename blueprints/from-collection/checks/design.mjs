// The design step's check, run after `yarn build`: reads the built stylesheets and the app's files and holds them to
// designRules.mjs. Prints each problem and exits 1 when there is any. The pack's templates are read from beside this
// file.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { designOf, designProblems } from "./designRules.mjs";

const SKIPPED = new Set(["node_modules", "dist", ".blueprint", ".git", "test", "functions", "coverage", ".wrangler", "supabase"]);
// Where Vite writes the build in every base (dist/, dist/client/, client/dist/).
const BUILD_DIR = "dist";
const THEMES = path.join(import.meta.dirname, "..", "design", "themes");

const readJson = (file) => {
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch {
    return null;
  }
};
const readText = (file) => (existsSync(file) ? readFileSync(file, "utf8") : null);

// Every file under the app whose name ends in one of `extensions`, skipping what the build makes or does not ship.
const filesUnder = (dir, extensions) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) return SKIPPED.has(entry.name) ? [] : filesUnder(file, extensions);
    return extensions.some((extension) => entry.name.endsWith(extension)) ? [{ path: file, text: readFileSync(file, "utf8") }] : [];
  });

// Every stylesheet the build wrote, joined; null when it wrote none.
function builtCss(dir = ".") {
  const found = readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(dir, entry.name);
    if (!entry.isDirectory()) return [];
    if (entry.name === BUILD_DIR) return filesUnderAll(file, ".css");
    return entry.name === "node_modules" || entry.name.startsWith(".") ? [] : [builtCss(file)].filter((css) => css !== null);
  });
  return found.length > 0 ? found.join("\n") : null;
}

const filesUnderAll = (dir, extension) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) return filesUnderAll(file, extension);
    return entry.name.endsWith(extension) ? [readFileSync(file, "utf8")] : [];
  });

// The starting collection's icon, the one MulmoTerminal shows in its header.
function iconOf() {
  const source = readJson(".blueprint/source/source.json");
  const slug = source?.start ?? source?.collections?.[0];
  const schema = slug ? readJson(`.blueprint/source/collections/${slug}/schema.json`) : null;
  return typeof schema?.icon === "string" ? schema.icon : null;
}

const answer = readJson(".blueprint/answers.json")?.design;
const design = designOf(answer);
const problems = designProblems({
  answer,
  packageJson: readJson("package.json"),
  builtCss: builtCss(),
  tailwindTheme: readText(path.join("node_modules", "tailwindcss", "theme.css")),
  sources: filesUnder(".", [".vue", ".ts", ".tsx"]),
  designMd: readText("DESIGN.md"),
  icon: iconOf(),
  template: design?.theme ? readText(path.join(THEMES, `${design.theme}.css`)) : null,
});
problems.forEach((problem) => console.error(problem));
if (problems.length > 0) process.exit(1);
console.log(`the screens follow the design "${design.option}"`);
