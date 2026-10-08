// The directory-config keys the Settings form writes (#2722). Both sides decide from this list:
// the server accepts an edit only for these keys and sends back only their values, and the form
// draws one row per key. A key joins when a form control for it lands — until then the file is the
// only way to set it, and its raw value stays on the server.
import type { DirConfigKey } from "./dirConfigSource.js";

export const DIR_FORM_COLOR_KEYS = ["headerColor", "headerTextColor", "badgeColor", "cellColor", "cellBorderColor", "dotColor", "buttonColor"] as const;

export const DIR_FORM_KEYS = [
  "name",
  ...DIR_FORM_COLOR_KEYS,
  "headerStatusTint",
  "headerStatusColors",
  "theme",
  "colors",
  "fontSize",
  "fontFamily",
  "orderPriority",
  "provider",
  "model",
  "appendSystemPrompt",
  "addDirs",
  "icon",
  "backgroundImage",
  "sound",
  "sounds",
  "buttons",
  "chips",
  "commands",
  "skills",
  "decks",
  "worktreeEnv",
] as const satisfies readonly DirConfigKey[];

export type DirFormKey = (typeof DIR_FORM_KEYS)[number];

export const isDirFormKey = (value: unknown): value is DirFormKey => typeof value === "string" && DIR_FORM_KEYS.some((key) => key === value);

/** One save: keys to write, and keys to take out of the directory's files so the global setting applies. */
export interface DirConfigEdit {
  set: Partial<Record<DirFormKey, unknown>>;
  unset: DirFormKey[];
}
