// A directory's `worktreeEnv` declaration as the Settings form edits it (#2728): one row per variable,
// named, with its kind — a port spread upward from `base`, or a slug with an optional prefix.
import { isRecord } from "../../common/isRecord";
import { ENV_NAME_RE, MAX_PORT_BASE, MAX_SLUG_CHARS, MIN_PORT, type WorktreeEnvVar } from "../../common/worktreeEnv";

export interface WorktreeEnvRow {
  name: string;
  variable: WorktreeEnvVar;
}

const isPortBase = (value: unknown): value is number => typeof value === "number" && Number.isInteger(value) && value >= MIN_PORT && value <= MAX_PORT_BASE;

function variableOf(value: unknown): WorktreeEnvVar | null {
  if (!isRecord(value)) return null;
  if (value.kind === "port") return isPortBase(value.base) ? { kind: "port", base: value.base } : null;
  if (value.kind !== "slug") return null;
  if (value.prefix === undefined) return { kind: "slug" };
  return typeof value.prefix === "string" && value.prefix.length <= MAX_SLUG_CHARS ? { kind: "slug", prefix: value.prefix } : null;
}

/** The variables the file declares that the loader keeps, in the file's order. */
export function worktreeEnvRows(value: unknown): WorktreeEnvRow[] {
  if (!isRecord(value)) return [];
  return Object.entries(value).flatMap(([name, raw]) => {
    const variable = ENV_NAME_RE.test(name) ? variableOf(raw) : null;
    return variable ? [{ name, variable }] : [];
  });
}

/** The declaration the rows write — a later row of the same name wins, as it would in the file. */
export const worktreeEnvOf = (rows: readonly WorktreeEnvRow[]): Record<string, WorktreeEnvVar> =>
  Object.fromEntries(rows.map((row) => [row.name, row.variable]));

/** A variable of `kind` to start a new row from: the port a dev server usually takes, or a bare slug. */
export const DEFAULT_PORT_BASE = 3000;
export const newVariable = (kind: WorktreeEnvVar["kind"]): WorktreeEnvVar => (kind === "port" ? { kind: "port", base: DEFAULT_PORT_BASE } : { kind: "slug" });

/** Whether a name can be written: the shape the schema takes, and not already declared. */
export const isNewVariableName = (name: string, rows: readonly WorktreeEnvRow[]): boolean => ENV_NAME_RE.test(name) && !rows.some((row) => row.name === name);
