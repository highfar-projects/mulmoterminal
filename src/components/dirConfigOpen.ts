import { fetchWithTimeout } from "../utils/fetchWithTimeout";

// Settings' way into a directory's config in the Files view (#2624). A directory with no config yet
// gets one first — an empty object, which sets nothing — so there is a file to open and edit.
export const DIR_CONFIG_FILE = ".mulmoterminal.json";
const EMPTY_DIR_CONFIG = "{}\n";

/** Create `.mulmoterminal.json` in `dir` unless it is there. True when the file exists afterwards —
 *  including when someone made it first, which the write reports as a conflict. */
export async function ensureDirConfigFile(dir: string): Promise<boolean> {
  const query = `cwd=${encodeURIComponent(dir)}&path=${encodeURIComponent(DIR_CONFIG_FILE)}`;
  try {
    const res = await fetchWithTimeout(`/api/files/browse/write?${query}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: EMPTY_DIR_CONFIG, baseVersion: null }),
    });
    return res.ok || res.status === 409;
  } catch {
    return false;
  }
}
