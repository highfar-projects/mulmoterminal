// The docs base holds the helpers every usecase on it shares (running chaff, reading Markdown sections).
// A usecase loads them from BLUEPRINT_BASE, which the executor sets for every check.
import { join } from "node:path";
import { pathToFileURL } from "node:url";

if (!process.env.BLUEPRINT_BASE) {
  console.error("BLUEPRINT_BASE is not set: run this check through the blueprint executor");
  process.exit(1);
}

/** The URL of a module in the docs base's checks/, for `await import(...)`. */
export const fromBase = (file) => pathToFileURL(join(process.env.BLUEPRINT_BASE, "checks", file)).href;
