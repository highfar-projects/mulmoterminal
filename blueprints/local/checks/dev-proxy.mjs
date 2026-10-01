// Loads the app's own Vite config through the app's own Vite, as `yarn dev` would, and holds its proxy to
// devProxyRules.mjs. Prints each problem and exits 1 when there is any; an app without a Vite config has no proxy. The
// config is looked for at the root and in client/, where the scaffold keeps the screens.
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { proxyProblems } from "./devProxyRules.mjs";

const CONFIG_NAMES = ["vite.config.ts", "vite.config.mts", "vite.config.js", "vite.config.mjs"];
const CONFIG_DIRS = [".", "client"];
const configFiles = CONFIG_DIRS.flatMap((dir) => CONFIG_NAMES.map((name) => path.resolve(dir, name))).filter((file) => existsSync(file));
if (configFiles.length === 0) process.exit(0);

let vite;
try {
  vite = await import(pathToFileURL(createRequire(path.resolve("package.json")).resolve("vite")).href);
} catch (error) {
  console.error(`could not load this app's vite to read its config: ${error instanceof Error ? error.message : error}`);
  process.exit(1);
}
const problemsOf = async (configFile) => {
  const loaded = await vite.loadConfigFromFile({ command: "serve", mode: "development" }, configFile, path.dirname(configFile), "silent");
  const label = path.relative(process.cwd(), configFile);
  return proxyProblems(loaded?.config?.server?.proxy).map((problem) => problem.replace("vite.config", label));
};
const problems = (await Promise.all(configFiles.map(problemsOf))).flat();
problems.forEach((problem) => console.error(problem));
process.exit(problems.length > 0 ? 1 : 0);
