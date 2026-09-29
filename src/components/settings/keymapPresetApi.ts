// Settings' Recommended keys on the wire (#2581): the server works the additions out on the keymap in
// the file, under its lock, and answers with the keymap as saved — or, when the file makes the list
// the reader was shown different, with the file's keymap and nothing written.
import { isRecord } from "../../../common/isRecord";
import type { ReservedPlatform } from "../../../common/keymap";
import type { PresetChange } from "../../../common/keymapPresets";
import { jsonBody } from "../../jsonBody";
import { fetchWithTimeout } from "../../utils/fetchWithTimeout";

export type PresetOutcome = { status: "saved" | "changed"; keymap: unknown } | { status: "failed" };

export async function applyKeymapPreset(platform: ReservedPlatform, expected: PresetChange[]): Promise<PresetOutcome> {
  try {
    const res = await fetchWithTimeout("/api/config/keymap-preset", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ platform, expected }),
    });
    const body = await jsonBody(res);
    if (res.ok) return { status: "saved", keymap: body.keymap };
    if (res.status === 409 && isRecord(body) && "keymap" in body) return { status: "changed", keymap: body.keymap };
    return { status: "failed" };
  } catch {
    return { status: "failed" };
  }
}
