// What `GET /api/dir-suggest?path=` answers about a path the launch form's field holds:
// whether it names a directory a session can start in, and the subdirectories that complete it.
import { isRecord } from "./isRecord.js";
import { isUnknownArray } from "./isUnknownArray.js";

export const DIR_SUGGEST_ROUTE = "/api/dir-suggest";

export interface DirSuggestResponse {
  /** The same answer the spawn gives: false means a session started here would be refused. */
  exists: boolean;
  /** Completions in the spelling that was typed (`~/ss/ll` → `~/ss/llm`), without a trailing slash. */
  suggestions: string[];
}

export const isDirSuggestResponse = (value: unknown): value is DirSuggestResponse =>
  isRecord(value) &&
  typeof value.exists === "boolean" &&
  isUnknownArray(value.suggestions) &&
  value.suggestions.every((suggestion) => typeof suggestion === "string");
