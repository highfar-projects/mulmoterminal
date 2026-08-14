// Environment sanitization for spawned PTYs.
//
// The server is usually started by a package-manager script (`yarn dev`,
// `npm run dev`, `npx mulmoterminal`), and those launchers leak their context
// into process.env. The worst offender: Homebrew's yarn wrapper exports
// PREFIX=/opt/homebrew, and nvm's auto-activation (`nvm use` in .zshrc) strips
// its bin dir from PATH *before* its compatibility check aborts on PREFIX —
// leaving the spawned shell with no node/npm/npx at all. The npm_*/INIT_CWD
// vars and the PATH shim dirs (yarn's temp node wrapper, node_modules/.bin)
// are the same class of leak: run-script context that a user terminal — or a
// claude session — should never inherit. Strip it all so spawned PTYs start
// from an environment a fresh login shell would recognize.

// All lowercase: matching is case-insensitive, since Windows env names are.
const REMOVED_NAMES = new Set([
  "prefix", // Homebrew yarn wrapper; fatal to nvm (see header comment)
  "init_cwd",
  "node", // npm run points it at the launching node binary
  "project_cwd", // yarn berry
  "berry_bin_folder", // yarn berry
  "npm_execpath",
  "npm_node_execpath",
  "npm_command",
]);

const REMOVED_PREFIXES = ["npm_config_", "npm_package_", "npm_lifecycle_"];

// Is this env var package-manager launcher context (vs. real user environment)?
// Deliberately narrow: HOMEBREW_PREFIX / CONDA_PREFIX etc. must survive.
export function isLauncherEnvVar(name: string): boolean {
  const lower = name.toLowerCase();
  return REMOVED_NAMES.has(lower) || REMOVED_PREFIXES.some((prefix) => lower.startsWith(prefix));
}

// Does the env var name the search path? Windows spells it "Path".
export function isPathVar(name: string): boolean {
  return name.toLowerCase() === "path";
}

// A variable out of a PLAIN env object, matched the way Windows matches: case-insensitively.
// `env.PATH` / `env.ComSpec` are only reliable on the live `process.env`, whose Windows
// lookups are case-insensitive; a copy (what sanitizePtyEnv returns) keeps whatever casing
// the system used and answers undefined to any other spelling.
export function envValue(env: NodeJS.ProcessEnv, name: string): string | undefined {
  const wanted = name.toLowerCase();
  return Object.entries(env).find(([key]) => key.toLowerCase() === wanted)?.[1];
}

export const pathFromEnv = (env: NodeJS.ProcessEnv): string | undefined => envValue(env, "PATH");

// yarn v1's temp dir is `yarn--` + a timestamp.
const YARN_SHIM_DIR = /^yarn--\d/;

// Is this PATH entry a run-script injection? yarn v1 prepends a temp dir with a
// `node` shim, and both yarn and npm prepend node_modules/.bin + npm's
// node-gyp-bin dirs. Matched on the entry's LAST segment: a directory that
// merely contains one of these names somewhere in its path is the user's.
export function isLauncherPathEntry(entry: string): boolean {
  const segments = entry.split(/[\\/]/).filter((segment) => segment !== "");
  if (segments.length === 0) return false; // "" and "/" name no directory of ours
  const last = segments[segments.length - 1];
  if (last === undefined) return false; // unreachable: length was checked above
  const parent = segments[segments.length - 2];
  return YARN_SHIM_DIR.test(last) || (last === ".bin" && parent === "node_modules") || last === "node-gyp-bin";
}

// PATH with the run-script injections removed; everything else (nvm, homebrew,
// system dirs) kept in order.
export function sanitizePathEntries(pathValue: string, delimiter: string): string {
  return pathValue
    .split(delimiter)
    .filter((entry) => !isLauncherPathEntry(entry))
    .join(delimiter);
}

// Read in this order by every locale-aware program; the first non-empty one wins.
const LOCALE_NAMES = ["LC_ALL", "LC_CTYPE", "LANG"];

// tmux itself tries this name first, and a client decides UTF-8 by looking for the
// substring "UTF-8" in the value — so this still fixes the rendering on a machine where
// the locale of that name does not actually exist.
const FALLBACK_LOCALE = "en_US.UTF-8";

// `env` with a UTF-8 LANG added when it names no locale at all (#1634).
//
// A process launched from a macOS GUI inherits launchd's environment, which carries no
// locale variable, and nothing between there and here supplies one. A tmux client that
// finds no UTF-8 name switches to its non-UTF-8 output path and writes any character it
// cannot map to DEC ACS as one `_` per CELL — so Japanese (width 2) arrives as pairs of
// underscores while the box-drawing around it, which ACS does cover, still looks right.
//
// Only when there is NO name: LC_ALL and LC_CTYPE outrank LANG, so writing LANG could not
// change a machine that has one, and a user's own `LANG=ja_JP.UTF-8` has to survive. An
// empty value does not count as a name — a login shell can export a bare `LANG=` beside a
// real LC_ALL.
//
// Not on Windows: it has neither the convention nor tmux, and git-bash reads LANG, so
// introducing a variable that was never there is a different bug waiting to happen.
// Names matched exactly, not the case-insensitive way envValue does it: Windows is already
// out, and everywhere else `lang` is simply a different variable from `LANG`.
export function withFallbackLocale(env: NodeJS.ProcessEnv, platform: NodeJS.Platform): NodeJS.ProcessEnv {
  if (platform === "win32") return env;
  if (LOCALE_NAMES.some((name) => (env[name] ?? "") !== "")) return env;
  return { ...env, LANG: FALLBACK_LOCALE };
}

// A copy of `env` safe to hand to a spawned PTY: launcher vars dropped, PATH
// (any casing — Windows uses "Path") cleaned. Never mutates the input.
export function sanitizePtyEnv(env: NodeJS.ProcessEnv, delimiter: string): NodeJS.ProcessEnv {
  const out: NodeJS.ProcessEnv = {};
  for (const [name, value] of Object.entries(env)) {
    if (isLauncherEnvVar(name)) continue;
    out[name] = isPathVar(name) && value !== undefined ? sanitizePathEntries(value, delimiter) : value;
  }
  return out;
}
