import { isRecord } from "../../common/isRecord";
import type { KeymapAction } from "../../common/keymap";
import { fetchWithTimeout } from "../utils/fetchWithTimeout";
import { setActiveKeymap } from "./activeKeymap";

// Set or clear ONE shortcut (#2619) on the keymap on disk. The answer is the keymap the server now
// holds, which is adopted as the live one — so the new key works at once, in this tab.
export type KeymapBindingOutcome = { ok: true; warnings: string[] } | { ok: false; problems: string[] };

const strings = (value: unknown): string[] => (Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : []);

export async function setKeymapBinding(action: KeymapAction, binding: string | null): Promise<KeymapBindingOutcome> {
  try {
    const res = await fetchWithTimeout("/api/config/keymap/binding", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action, binding }),
    });
    const body: unknown = await res.json().catch(() => null);
    if (res.ok && isRecord(body)) {
      setActiveKeymap(body.keymap);
      return { ok: true, warnings: strings(body.warnings) };
    }
    const problems = isRecord(body) ? strings(body.problems) : [];
    return { ok: false, problems: problems.length ? problems : [isRecord(body) && typeof body.error === "string" ? body.error : `HTTP ${res.status}`] };
  } catch (err) {
    return { ok: false, problems: [err instanceof Error ? err.message : String(err)] };
  }
}
