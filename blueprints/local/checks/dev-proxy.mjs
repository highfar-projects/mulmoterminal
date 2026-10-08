// Resolves the app's own Vite config through the app's own Vite, plugins included, as `yarn dev` would, and holds its proxy to
// devProxyRules.mjs. Prints each problem and exits 1 when there is any; an app without a Vite config has no proxy. The
// config is looked for at the root and in client/, where the scaffold keeps the screens.
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { proxyProblems } from "./devProxyRules.mjs";

const CONFIG_NAMES = ["vite.config.ts", "vite.config.mts", "vite.config.cts", "vite.config.js", "vite.config.mjs", "vite.config.cjs"];
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
  // resolveConfig, not loadConfigFromFile: a plugin's config hook can add or change the proxy, and the dev server uses
  // what the hooks leave.
  const resolved = await vite.resolveConfig({ configFile, logLevel: "silent" }, "serve", "development");
  const label = path.relative(process.cwd(), configFile);
  return proxyProblems(resolved.server?.proxy).map((problem) => problem.replace("vite.config", label));
};
const problems = (await Promise.all(configFiles.map(problemsOf))).flat();
problems.forEach((problem) => console.error(problem));
process.exit(problems.length > 0 ? 1 : 0);
