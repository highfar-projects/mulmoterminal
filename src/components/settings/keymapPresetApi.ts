// Settings' Recommended keys on the wire (#2581): the server works the additions out on the keymap in
// the file, under its lock, and answers with the keymap as saved — or, when the file makes the list
// the reader was shown different, with the file's keymap and nothing written.
import { isRecord } from "../../../common/isRecord";
import type { ReservedPlatform } from "../../../common/keymap";
import type { PresetChange } from "../../../common/keymapPresets";
import { jsonBody } from "../../jsonBody";
import { fetchWithTimeout } from "../../utils/fetchWithTimeout";

export type PresetOutcome = { status: "saved" | "changed"; keymap: unknown; reserved: string[] } | { status: "failed" };

/** The keys entries this version does not know hold in the file (#2693); none when unreadable. */
const reservedOf = (body: Record<string, unknown>): string[] =>
  Array.isArray(body.reserved) ? body.reserved.filter((binding): binding is string => typeof binding === "string") : [];

export async function fetchPresetReserved(): Promise<string[]> {
  try {
    const res = await fetchWithTimeout("/api/config/keymap-preset");
    return res.ok ? reservedOf(await jsonBody(res)) : [];
  } catch {
    return [];
  }
}

export async function applyKeymapPreset(platform: ReservedPlatform, expected: PresetChange[]): Promise<PresetOutcome> {
  try {
    const res = await fetchWithTimeout("/api/config/keymap-preset", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ platform, expected }),
    });
    const body = await jsonBody(res);
    // Only a keymap that was actually read is adopted: an unreadable body is `{}`, and taking its
    // missing keymap as the saved one would empty this tab's shortcuts while saying "added".
    if (!isRecord(body.keymap)) return { status: "failed" };
    if (res.ok) return { status: "saved", keymap: body.keymap, reserved: reservedOf(body) };
    if (res.status === 409) return { status: "changed", keymap: body.keymap, reserved: reservedOf(body) };
    return { status: "failed" };
  } catch {
    return { status: "failed" };
  }
}
