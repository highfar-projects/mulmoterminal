// Reads a project's `.vscode/launch.json` and turns each configuration VS Code could run into a
// plain shell command this app can run in a terminal cell — no debugger, no breakpoints, just
// execution. Mirrors server/files/scripts.ts's shape exactly: the browser sends only an INDEX
// into this list (never a raw command), and the server re-reads the file to resolve it — so the
// file is the allowlist of what can run.
import { existsSync, statSync } from "node:fs";
import path from "node:path";
import { parse as parseJsonc } from "jsonc-parser";
import { readTextFile } from "../infra/read-text-file.js";
import { isRecord } from "../../common/isRecord.js";
import { isUnknownArray } from "../../common/isUnknownArray.js";
import { shellQuoteFor } from "../infra/shell-quote.js";

export interface LaunchConfigDef {
  label: string;
  command: string;
  // Optional working dir: relative to the workspace root, or absolute. Omitted => run in the
  // workspace root — same convention as ScriptDef.cwd (server/files/scripts.ts).
  cwd?: string;
}

const LAUNCH_CONFIG_FILE = path.join(".vscode", "launch.json");

// VS Code resolves these against the EDITOR session — the currently open file, an
// extension-contributed `${command:...}`, an interactive `${input:...}` prompt — and this app has
// none of that context. A configuration that needs one of them can't be approximated, so it is
// dropped rather than run with the literal string "${file}" on the command line.
const UNSUPPORTED_VAR_RE =
  /\$\{(input|command|file|fileBasename|fileBasenameNoExtension|fileDirname|fileExtname|relativeFile|relativeFileDirname|lineNumber|selectedText|execPath|pathSeparator|cwd|defaultBuildTask):?[^}]*\}/;
const WORKSPACE_VAR_RE = /\$\{(?:workspaceFolder|workspaceRoot)\}/g;
const WORKSPACE_BASENAME_VAR_RE = /\$\{workspaceFolderBasename\}/g;
// Left as the literal `$NAME` rather than resolved here — the shell that actually runs the
// command (shellInvocation, server/session/spawn-shell.ts) resolves it against ITS OWN
// environment at run time, which is the one that matters, not this server process's.
const ENV_VAR_RE = /\$\{env:(\w+)\}/g;

/** Substitutes the variables this app can actually answer; `null` if `value` uses one it can't
 *  (see UNSUPPORTED_VAR_RE) — the caller treats that as "this configuration can't run here." */
function substituteVar(value: string, workspaceDir: string): string | null {
  if (UNSUPPORTED_VAR_RE.test(value)) return null;
  return value.replace(WORKSPACE_VAR_RE, workspaceDir).replace(WORKSPACE_BASENAME_VAR_RE, path.basename(workspaceDir)).replace(ENV_VAR_RE, "$$$1");
}

/** `null` propagates: one unsupported value in the array disqualifies the whole configuration,
 *  the same as an unsupported `program`/`cwd` does. */
function substituteEach(values: string[], workspaceDir: string): string[] | null {
  const out: string[] = [];
  for (const v of values) {
    const s = substituteVar(v, workspaceDir);
    if (s === null) return null;
    out.push(s);
  }
  return out;
}

// The subset of a VS Code launch configuration this app knows how to translate. Untyped/unknown
// fields (breakpoints, sourceMaps, console, …) are simply never read.
interface RawLaunchConfig {
  name: string;
  type?: string;
  request?: string;
  program?: string;
  args?: string[];
  runtimeExecutable?: string;
  runtimeArgs?: string[];
  module?: string;
  env?: Record<string, string>;
  cwd?: string;
}

const isRawLaunchConfig = (v: unknown): v is RawLaunchConfig => isRecord(v) && typeof v.name === "string";

// Best-effort, not all-or-nothing: a non-string entry is dropped rather than disqualifying the
// whole array (VS Code's own schema allows objects here for platform-specific overrides, which
// this app doesn't resolve).
const stringArray = (v: unknown): string[] => (isUnknownArray(v) ? v.filter((x): x is string => typeof x === "string") : []);

const stringRecord = (v: unknown): Record<string, string> => {
  if (!isRecord(v)) return {};
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(v)) if (typeof value === "string") out[key] = value;
  return out;
};

const quote = shellQuoteFor(process.platform);
const quoteAll = (values: string[]): string[] => values.map(quote);

/** `env` becomes a prefix on the command string: `env NAME='value' …` on POSIX (a real command
 *  the shell already has), `$env:NAME='value'; …` statements on PowerShell — the shell that runs
 *  it is decided by `shellInvocation` (server/session/spawn-shell.ts), not here. */
function buildEnvPrefix(env: Record<string, string>, workspaceDir: string): string | null {
  const parts: string[] = [];
  for (const [name, rawValue] of Object.entries(env)) {
    const value = substituteVar(rawValue, workspaceDir);
    if (value === null) return null;
    parts.push(process.platform === "win32" ? `$env:${name}=${quote(value)};` : `${name}=${quote(value)}`);
  }
  if (parts.length === 0) return "";
  return process.platform === "win32" ? `${parts.join(" ")} ` : `env ${parts.join(" ")} `;
}

// The fields every per-type builder below needs, already substituted — `undefined` means the
// field was absent, `null` never appears here (buildMainCommand bails out before calling any of
// these if a substitution failed).
interface SubstitutedFields {
  program: string | undefined;
  runtimeExecutable: string | undefined;
  args: string[];
  runtimeArgs: string[];
}

function nodeCommand({ program, runtimeExecutable, args, runtimeArgs }: SubstitutedFields): string | null {
  if (!program && !runtimeExecutable) return null;
  const exe = runtimeExecutable ?? "node";
  return [quote(exe), ...quoteAll(runtimeArgs), ...(program ? [quote(program)] : []), ...quoteAll(args)].join(" ");
}

function pythonCommand({ program, runtimeExecutable, args }: SubstitutedFields, config: RawLaunchConfig, workspaceDir: string): string | null {
  const exe = runtimeExecutable ?? "python3";
  const module = config.module !== undefined ? substituteVar(config.module, workspaceDir) : undefined;
  if (module === null) return null; // only reachable when config.module was actually defined
  if (module) return [quote(exe), "-m", quote(module), ...quoteAll(args)].join(" ");
  if (program) return [quote(exe), quote(program), ...quoteAll(args)].join(" ");
  return null;
}

// Anything not specifically handled above (go, java, cppdbg, chrome, …): run whichever of
// runtimeExecutable/program is set. Both set means runtimeExecutable is the interpreter and
// program is its first argument (e.g. a Java launcher taking a jar path); program alone means
// it's directly executable (a compiled binary). Neither set (most browser/attach-only configs,
// which point at a `url` instead) has nothing to run.
function genericCommand({ program, runtimeExecutable, args, runtimeArgs }: SubstitutedFields): string | null {
  const exe = runtimeExecutable ?? program;
  if (!exe) return null;
  const rest = runtimeExecutable && program ? [program, ...args] : args;
  return [quote(exe), ...quoteAll(runtimeArgs), ...quoteAll(rest)].join(" ");
}

/** The part after the `env` prefix: which interpreter/executable to run and with what, decided
 *  by `type` — `node`/`python` get a correct interpreter invocation; everything else gets
 *  `genericCommand`'s fallback. `null` for a configuration this app has no way to run: an
 *  `attach` request, one whose `program`/`args`/`runtimeExecutable`/`module` need an unsupported
 *  variable, or one with neither a `program` nor a `runtimeExecutable` to invoke at all. */
function buildMainCommand(config: RawLaunchConfig, workspaceDir: string): string | null {
  if (config.request === "attach") return null;

  const program = config.program !== undefined ? substituteVar(config.program, workspaceDir) : undefined;
  if (program === null) return null; // only reachable when config.program was actually defined
  const runtimeExecutable = config.runtimeExecutable !== undefined ? substituteVar(config.runtimeExecutable, workspaceDir) : undefined;
  if (runtimeExecutable === null) return null; // ditto, for config.runtimeExecutable
  const args = substituteEach(stringArray(config.args), workspaceDir);
  if (args === null) return null;
  const runtimeArgs = substituteEach(stringArray(config.runtimeArgs), workspaceDir);
  if (runtimeArgs === null) return null;
  const fields: SubstitutedFields = { program, runtimeExecutable, args, runtimeArgs };

  const type = config.type ?? "";
  if (type === "node" || type === "node-terminal" || type === "pwa-node") return nodeCommand(fields);
  if (type === "python" || type === "debugpy") return pythonCommand(fields, config, workspaceDir);
  return genericCommand(fields);
}

function buildLaunchCommand(config: RawLaunchConfig, workspaceDir: string): { command: string; cwd?: string } | null {
  const main = buildMainCommand(config, workspaceDir);
  if (main === null) return null;
  const envPrefix = buildEnvPrefix(stringRecord(config.env), workspaceDir);
  if (envPrefix === null) return null;
  const cwd = config.cwd !== undefined ? substituteVar(config.cwd, workspaceDir) : undefined;
  if (cwd === null) return null; // only reachable when config.cwd was actually defined
  return { command: `${envPrefix}${main}`, ...(cwd ? { cwd } : {}) };
}

// Read and translate `<workspaceDir>/.vscode/launch.json`. A missing/invalid file, or one whose
// `configurations` are all unsupported, yields [] so the grid still works — the menu is just
// absent. `compounds` (multi-configuration launches) are deliberately not read: each cell runs
// one command, and a compound has no single command to run.
export function loadLaunchConfigs(workspaceDir: string, max = 100): LaunchConfigDef[] {
  try {
    const file = path.join(workspaceDir, LAUNCH_CONFIG_FILE);
    if (!existsSync(file)) return [];
    // parseJsonc, not JSON.parse: VS Code's own file allows comments and trailing commas, which
    // most real launch.json files actually have.
    const parsed: unknown = parseJsonc(readTextFile(file));
    if (!isRecord(parsed) || !isUnknownArray(parsed.configurations)) return [];
    const defs: LaunchConfigDef[] = [];
    for (const raw of parsed.configurations) {
      if (defs.length >= max) break;
      if (!isRawLaunchConfig(raw)) continue;
      const built = buildLaunchCommand(raw, workspaceDir);
      if (!built) continue;
      const label = raw.name.trim();
      const command = built.command.trim();
      if (!label || !command) continue;
      defs.push({ label, command, ...(built.cwd ? { cwd: built.cwd } : {}) });
    }
    return defs;
  } catch {
    return [];
  }
}

// Resolve a launch configuration by its position in the loaded list to a runnable command + an
// absolute, existing cwd — same contract as server/files/scripts.ts's resolveScript.
export function resolveLaunchConfig(workspaceDir: string, index: number): { command: string; cwd: string } | null {
  const configs = loadLaunchConfigs(workspaceDir);
  if (!Number.isInteger(index) || index < 0 || index >= configs.length) return null;
  const def = configs[index];
  if (!def) return null; // unreachable: the bounds were checked above
  const cwd = def.cwd ? path.resolve(workspaceDir, def.cwd) : workspaceDir;
  try {
    if (!statSync(cwd).isDirectory()) return null;
  } catch {
    return null;
  }
  return { command: def.command, cwd };
}
