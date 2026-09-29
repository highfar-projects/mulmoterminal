// The keymap as the server has it now (#2581), for a write that replaces it whole. Null when it
// cannot be read: then nothing is written.
import { sanitizeKeymap, type Keymap } from "../../../common/keymap";
import { jsonBody } from "../../jsonBody";
import { fetchWithTimeout } from "../../utils/fetchWithTimeout";

export async function savedKeymap(): Promise<Keymap | null> {
  try {
    const res = await fetchWithTimeout("/api/config");
    if (!res.ok) return null;
    return sanitizeKeymap((await jsonBody(res)).keymap);
  } catch {
    return null;
  }
}
