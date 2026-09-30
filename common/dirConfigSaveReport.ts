// What saving a directory's config file from the Files pane tells the pane (#2624): whether the
// file is a JSON object at all, and which keys did not take effect. Both sides decide from it — the
// server builds it after the write, the pane says it under the editor — so its shape lives here.
import { isRecord } from "./isRecord.js";

export interface DirConfigSaveReport {
  /** False when the saved text is not a JSON object: then nothing in the file applies. */
  parsed: boolean;
  /** Keys this build knows whose value was dropped (a colour that is not a hex, a path outside). */
  ignored: string[];
  /** Keys this build does not know at all (a typo, or a setting from another version). */
  unknown: string[];
}

const strings = (value: unknown): string[] => (Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : []);

/** The report as the pane receives it, or null when the answer carries none (not a config file). */
export function readDirConfigSaveReport(value: unknown): DirConfigSaveReport | null {
  if (!isRecord(value) || typeof value.parsed !== "boolean") return null;
  return { parsed: value.parsed, ignored: strings(value.ignored), unknown: strings(value.unknown) };
}

/** Built from the text just written and the merged view of the directory's config files. */
export function dirConfigSaveReport(text: string, source: { ignored: readonly string[]; unknown: readonly string[] }): DirConfigSaveReport {
  return { parsed: isJsonObject(text), ignored: [...source.ignored], unknown: [...source.unknown] };
}

function isJsonObject(text: string): boolean {
  try {
    return isRecord(JSON.parse(text));
  } catch {
    return false;
  }
}
