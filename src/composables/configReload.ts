import { isRecord } from "../../common/isRecord";
import { fetchWithTimeout } from "../utils/fetchWithTimeout";

// Ask the server to read config.json again (#2627). A refusal keeps the running config and says why:
// the file does not parse, or its keymap would stop the server from starting.
export type ConfigReloadOutcome = { ok: true } | { ok: false; error: string; problems: string[] };

const strings = (value: unknown): string[] => (Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : []);

export async function reloadConfigFile(): Promise<ConfigReloadOutcome> {
  try {
    const res = await fetchWithTimeout("/api/config/reload", { method: "POST" });
    if (res.ok) return { ok: true };
    const body: unknown = await res.json().catch(() => null);
    const error = isRecord(body) && typeof body.error === "string" ? body.error : `HTTP ${res.status}`;
    return { ok: false, error, problems: isRecord(body) ? strings(body.problems) : [] };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err), problems: [] };
  }
}
