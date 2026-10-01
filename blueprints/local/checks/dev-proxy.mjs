// Loads the app's own Vite config through the app's own Vite, as `yarn dev` would, and holds its proxy to
// devProxyRules.mjs. Prints each problem and exits 1 when there is any; an app without a Vite config has no proxy.
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { proxyProblems } from "./devProxyRules.mjs";

const CONFIG_NAMES = ["vite.config.ts", "vite.config.mts", "vite.config.js", "vite.config.mjs"];
const configFile = CONFIG_NAMES.map((name) => path.resolve(name)).find((file) => existsSync(file));
if (!configFile) process.exit(0);

let vite;
try {
  vite = await import(pathToFileURL(createRequire(path.resolve("package.json")).resolve("vite")).href);
} catch (error) {
  console.error(`could not load this app's vite to read ${path.basename(configFile)}: ${error instanceof Error ? error.message : error}`);
  process.exit(1);
}
const loaded = await vite.loadConfigFromFile({ command: "serve", mode: "development" }, configFile, process.cwd(), "silent");
const problems = proxyProblems(loaded?.config?.server?.proxy);
problems.forEach((problem) => console.error(problem));
process.exit(problems.length > 0 ? 1 : 0);
