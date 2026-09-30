// The rows of the Settings form for one directory's config (#2722), and what an input's value
// becomes when it is saved. Kept apart from the component so the conversion — the part that
// decides what lands in the user's file — is tested without mounting anything.
import { DIR_FORM_COLOR_KEYS, type DirConfigEdit, type DirFormKey } from "../../common/dirConfigForm";

export type DirFormFieldKind = "text" | "color" | "number" | "theme" | "tint" | "bool";

export interface DirFormField {
  key: DirFormKey;
  kind: DirFormFieldKind;
}

// In the order the preview reads: what the directory is called, its colours as the eye meets them,
// then the terminal's own settings.
export const DIR_FORM_FIELDS: readonly DirFormField[] = [
  { key: "name", kind: "text" },
  ...DIR_FORM_COLOR_KEYS.map((key): DirFormField => ({ key, kind: "color" })),
  { key: "headerStatusTint", kind: "tint" },
  { key: "theme", kind: "theme" },
  { key: "fontSize", kind: "number" },
  { key: "fontFamily", kind: "text" },
  { key: "orderPriority", kind: "number" },
  { key: "appendSystemPrompt", kind: "bool" },
];

const unset = (key: DirFormKey): DirConfigEdit => ({ set: {}, unset: [key] });
const setTo = (key: DirFormKey, value: unknown): DirConfigEdit => ({ set: { [key]: value }, unset: [] });

// Keys edited as a whole set by an editor of their own rather than by one input (#2724): the colour
// per header status, and the terminal palette.
export const DIR_FORM_SET_KEYS = ["headerStatusColors", "colors", "addDirs"] as const satisfies readonly DirFormKey[];

// `provider` and `model` are one choice in the form — a model belongs to a backend — so one select
// writes both (#2725).
export const DIR_FORM_MODEL_KEYS = ["provider", "model"] as const satisfies readonly DirFormKey[];

// Edited by the pictures-and-sounds section (#2726), each with a control of its own.
export const DIR_FORM_MEDIA_KEYS = ["icon", "backgroundImage", "sound", "sounds"] as const satisfies readonly DirFormKey[];

/** The save for a whole set: written when it holds anything, taken out of the file when it is empty,
 *  so an emptied set falls back to the global one rather than overriding it with nothing. */
export function editForSet(key: DirFormKey, value: Record<string, unknown> | readonly unknown[]): DirConfigEdit {
  const size = Array.isArray(value) ? value.length : Object.keys(value).length;
  return size === 0 ? unset(key) : setTo(key, value);
}

const MODEL_CHOICE_SEPARATOR = "|";

/** The select value naming a backend and one of its models, the same encoding the launch picker uses. */
export const modelChoiceValue = (provider: string, model: string): string => `${provider}${MODEL_CHOICE_SEPARATOR}${model}`;

/** What the directory's files choose, as a select value: "" when they choose neither. */
export function currentModelChoice(values: Record<string, unknown>): string {
  const provider = typeof values.provider === "string" ? values.provider : "";
  const model = typeof values.model === "string" ? values.model : "";
  return provider === "" && model === "" ? "" : modelChoiceValue(provider, model);
}

/** The save a model choice asks for. "" takes both keys out, so the directory runs on whatever a
 *  launch picks; a choice writes both, and a half left empty is taken out rather than written empty. */
export function editForModelChoice(choice: string): DirConfigEdit {
  if (choice === "") return { set: {}, unset: [...DIR_FORM_MODEL_KEYS] };
  // At the FIRST separator: a provider id cannot hold one, a model id could.
  const at = choice.indexOf(MODEL_CHOICE_SEPARATOR);
  const provider = at === -1 ? "" : choice.slice(0, at);
  const model = at === -1 ? choice : choice.slice(at + 1);
  const halves: [DirFormKey, string][] = [
    ["provider", provider],
    ["model", model],
  ];
  return {
    set: Object.fromEntries(halves.filter(([, value]) => value !== "")),
    unset: halves.filter(([, value]) => value === "").map(([key]) => key),
  };
}

/** The save an input's text asks for. Clearing a text, number or theme field takes the key out of
 *  the file, so the global setting applies again. Null when the text is not a value the field can
 *  hold — a fraction for a whole number — which the form refuses before asking the server. */
export function editForInput(field: DirFormField, raw: string): DirConfigEdit | null {
  const text = raw.trim();
  if (field.kind === "color") return /^#[0-9a-fA-F]{6}$/.test(text) ? setTo(field.key, text.toLowerCase()) : null;
  if (text === "") return unset(field.key);
  if (field.kind === "bool") return text === "true" || text === "false" ? setTo(field.key, text === "true") : null;
  if (field.kind !== "number") return setTo(field.key, text);
  const value = Number(text);
  return Number.isInteger(value) ? setTo(field.key, value) : null;
}

/** What an input shows for the directory's value: the text the file holds, or empty when it holds
 *  nothing this field can show. */
export function inputText(field: DirFormField, value: unknown): string {
  if (field.kind === "number") return typeof value === "number" && Number.isFinite(value) ? String(value) : "";
  if (field.kind === "bool") return typeof value === "boolean" ? String(value) : "";
  return typeof value === "string" ? value : "";
}

// What a colour picker starts on when the file sets no colour: `<input type="color">` has no empty
// state, so the row says "not set" beside it and the swatch is only where a pick begins.
export const UNSET_COLOR_PICKER_START = "#808080";
