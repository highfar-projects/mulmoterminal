// The rows of the Settings form for one directory's config (#2722), and what an input's value
// becomes when it is saved. Kept apart from the component so the conversion — the part that
// decides what lands in the user's file — is tested without mounting anything.
import { DIR_FORM_COLOR_KEYS, type DirConfigEdit, type DirFormKey } from "../../common/dirConfigForm";

export type DirFormFieldKind = "text" | "color" | "number" | "theme";

export interface DirFormField {
  key: DirFormKey;
  kind: DirFormFieldKind;
}

// In the order the preview reads: what the directory is called, its colours as the eye meets them,
// then the terminal's own settings.
export const DIR_FORM_FIELDS: readonly DirFormField[] = [
  { key: "name", kind: "text" },
  ...DIR_FORM_COLOR_KEYS.map((key): DirFormField => ({ key, kind: "color" })),
  { key: "theme", kind: "theme" },
  { key: "fontSize", kind: "number" },
  { key: "fontFamily", kind: "text" },
  { key: "orderPriority", kind: "number" },
];

const unset = (key: DirFormKey): DirConfigEdit => ({ set: {}, unset: [key] });
const setTo = (key: DirFormKey, value: unknown): DirConfigEdit => ({ set: { [key]: value }, unset: [] });

/** The save an input's text asks for. Clearing a text, number or theme field takes the key out of
 *  the file, so the global setting applies again. Null when the text is not a value the field can
 *  hold — a fraction for a whole number — which the form refuses before asking the server. */
export function editForInput(field: DirFormField, raw: string): DirConfigEdit | null {
  const text = raw.trim();
  if (field.kind === "color") return /^#[0-9a-fA-F]{6}$/.test(text) ? setTo(field.key, text.toLowerCase()) : null;
  if (text === "") return unset(field.key);
  if (field.kind !== "number") return setTo(field.key, text);
  const value = Number(text);
  return Number.isInteger(value) ? setTo(field.key, value) : null;
}

/** What an input shows for the directory's value: the text the file holds, or empty when it holds
 *  nothing this field can show. */
export function inputText(field: DirFormField, value: unknown): string {
  if (field.kind === "number") return typeof value === "number" && Number.isFinite(value) ? String(value) : "";
  return typeof value === "string" ? value : "";
}

// What a colour picker starts on when the file sets no colour: `<input type="color">` has no empty
// state, so the row says "not set" beside it and the swatch is only where a pick begins.
export const UNSET_COLOR_PICKER_START = "#808080";
