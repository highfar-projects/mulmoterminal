// What the Settings form's save does to a directory's two config files (#2722), with no disk in
// sight: read the request, decide which file each key lands in, and rewrite one file's text.
// dir-config-write.ts does the reading and writing around it.
import { isRecord } from "../../../common/isRecord.js";
import { isDirFormKey, type DirConfigEdit, type DirFormKey } from "../../../common/dirConfigForm.js";

export type ValueCheck = (key: DirFormKey, value: unknown) => boolean;

/** The request body as an edit, or the reason it is not one. Every key must be a form key and every
 *  value one the file may hold; a key both set and unset is refused rather than guessed at. */
export function parseDirConfigEdit(body: unknown, isValid: ValueCheck): DirConfigEdit | string {
  if (!isRecord(body)) return "body must be an object";
  const set = body.set ?? {};
  const unsetField = body.unset ?? [];
  if (!isRecord(set) || !Array.isArray(unsetField)) return "set must be an object and unset an array";
  const unset: unknown[] = unsetField;
  const setKeys = Object.keys(set);
  const badKey = [...setKeys, ...unset].find((key) => !isDirFormKey(key));
  if (badKey !== undefined) return `not a key this form writes: ${JSON.stringify(badKey)}`;
  const unsetKeys = unset.filter(isDirFormKey);
  const formKeys = setKeys.filter(isDirFormKey);
  if (formKeys.length === 0 && unsetKeys.length === 0) return "nothing to change";
  const both = formKeys.find((key) => unsetKeys.includes(key));
  if (both !== undefined) return `set and unset both name ${both}`;
  const invalid = formKeys.find((key) => !isValid(key, set[key]));
  if (invalid !== undefined) return `not a valid value for ${invalid}`;
  return { set: Object.fromEntries(formKeys.map((key) => [key, set[key]])), unset: unsetKeys };
}

/** Which file each part of the edit goes to. A key the checkout's own file already holds is written
 *  there — writing it to the shared file would change nothing on screen, since local wins. Anything
 *  else goes to the shared file. Unsetting takes the key out of BOTH, so the directory stops setting
 *  it rather than falling back to the other file's value. */
export function splitEditByFile(edit: DirConfigEdit, localKeys: readonly string[]): { shared: DirConfigEdit; local: DirConfigEdit } {
  const inLocal = (key: DirFormKey) => localKeys.includes(key);
  const entries = Object.entries(edit.set).filter((entry): entry is [DirFormKey, unknown] => isDirFormKey(entry[0]));
  return {
    shared: { set: Object.fromEntries(entries.filter(([key]) => !inLocal(key))), unset: edit.unset },
    local: { set: Object.fromEntries(entries.filter(([key]) => inLocal(key))), unset: edit.unset.filter(inLocal) },
  };
}

export const isEmptyEdit = (edit: DirConfigEdit): boolean => Object.keys(edit.set).length === 0 && edit.unset.length === 0;

const DEFAULT_INDENT = "  ";

// The indent the file already uses, so a save from the form does not reformat a hand-written file
// into a diff of whitespace. Tabs or any run of spaces; two spaces when there is nothing to go by.
export function detectIndent(text: string): string {
  const match = /^\n?([ \t]+)"/m.exec(text);
  return match?.[1] ?? DEFAULT_INDENT;
}

/** The file's new text, or null when its current text is not a JSON object — a file someone is
 *  halfway through writing by hand must not be replaced by the part of it the form knows about.
 *  `current` null means the file does not exist yet. Keys the edit does not name keep their values
 *  and their order; a new key goes at the end. */
export function applyEditToText(current: string | null, edit: DirConfigEdit): string | null {
  const parsed = parseObject(current);
  if (parsed === null) return null;
  const unset = new Set<string>(edit.unset);
  const next = Object.fromEntries(Object.entries({ ...parsed, ...edit.set }).filter(([key]) => !unset.has(key)));
  return `${JSON.stringify(next, null, detectIndent(current ?? ""))}\n`;
}

function parseObject(text: string | null): Record<string, unknown> | null {
  if (text === null || text.trim() === "") return {};
  try {
    const value: unknown = JSON.parse(text);
    return isRecord(value) ? value : null;
  } catch {
    return null;
  }
}

export type MovePlan = { source: string; dest: string } | { problem: "absent" | "unreadable" };

/** Moving one key from a directory's shared file to its checkout-only file or back (#2728): the new
 *  text of both. The value moves as the file writes it — nothing re-validated, nothing reshaped — and
 *  a key the source does not hold, or a file that is not a JSON object, moves nothing. */
export function planMove(sourceText: string | null, destText: string | null, key: DirFormKey): MovePlan {
  const source = parseObject(sourceText);
  if (source === null) return { problem: "unreadable" };
  if (!(key in source)) return { problem: "absent" };
  const nextSource = applyEditToText(sourceText, { set: {}, unset: [key] });
  const nextDest = applyEditToText(destText, { set: { [key]: source[key] }, unset: [] });
  if (nextSource === null || nextDest === null) return { problem: "unreadable" };
  return { source: nextSource, dest: nextDest };
}
