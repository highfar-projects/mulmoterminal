// A directory's pictures and sounds as the Settings form edits them (#2726): the icon, the terminal
// background, and the attention sounds. Read from what the file holds; each save names the one key
// it changes.
import { isRecord } from "../../common/isRecord";
import type { DirConfigEdit } from "../../common/dirConfigForm";
import {
  DIR_BACKGROUND_DEFAULT_FIT,
  DIR_BACKGROUND_DEFAULT_OPACITY,
  isDirBackgroundFit,
  isDirBackgroundOpacity,
  type DirBackgroundFit,
} from "../../common/dirBackground";
import { NOTIFY_KINDS, type NotifyKind } from "../../common/notifyKinds";
import { parsePresetRef } from "../../common/notifySounds";

// ---- icon -------------------------------------------------------------------------------------

/** `auto`: the key is absent, so the repository's own favicon is looked for. `none`: `false`, which
 *  stops that. `image`: a path, URL or data: image the file names. */
export type DirIconMode = "auto" | "none" | "image";

export function iconMode(value: unknown): DirIconMode {
  if (value === false) return "none";
  return typeof value === "string" && value.trim() !== "" ? "image" : "auto";
}

/** The save for an icon choice. An image with no text yet is not a choice, so it is null and the
 *  form waits for the text rather than writing an empty path. */
export function editForIcon(mode: DirIconMode, image: string): DirConfigEdit | null {
  if (mode === "auto") return { set: {}, unset: ["icon"] };
  if (mode === "none") return { set: { icon: false }, unset: [] };
  const text = image.trim();
  return text === "" ? null : { set: { icon: text }, unset: [] };
}

// ---- background -------------------------------------------------------------------------------

export interface DirBackgroundDraft {
  image: string;
  opacity: number;
  fit: DirBackgroundFit;
}

/** The background the file sets, in either spelling, with the defaults filled in; null for none. */
export function backgroundFromValue(value: unknown): DirBackgroundDraft | null {
  if (typeof value === "string") return value.trim() === "" ? null : { image: value, opacity: DIR_BACKGROUND_DEFAULT_OPACITY, fit: DIR_BACKGROUND_DEFAULT_FIT };
  if (!isRecord(value) || typeof value.image !== "string" || value.image.trim() === "") return null;
  return {
    image: value.image,
    opacity: isDirBackgroundOpacity(value.opacity) ? value.opacity : DIR_BACKGROUND_DEFAULT_OPACITY,
    fit: isDirBackgroundFit(value.fit) ? value.fit : DIR_BACKGROUND_DEFAULT_FIT,
  };
}

/** The save for a background. The bare string when both settings are the defaults — the spelling a
 *  person writes for "just this picture" — and the object otherwise, naming only what differs. */
export function editForBackground(background: DirBackgroundDraft | null): DirConfigEdit | null {
  if (background === null) return { set: {}, unset: ["backgroundImage"] };
  const image = background.image.trim();
  if (image === "" || !isDirBackgroundOpacity(background.opacity)) return null;
  const opacity = background.opacity === DIR_BACKGROUND_DEFAULT_OPACITY ? {} : { opacity: background.opacity };
  const fit = background.fit === DIR_BACKGROUND_DEFAULT_FIT ? {} : { fit: background.fit };
  const isPlain = Object.keys(opacity).length === 0 && Object.keys(fit).length === 0;
  return { set: { backgroundImage: isPlain ? image : { image, ...opacity, ...fit } }, unset: [] };
}

// ---- sounds -----------------------------------------------------------------------------------

/** How a sound value reads: a preset the app ships, or a file the directory holds. */
export type DirSoundChoice = { kind: "preset"; ref: string } | { kind: "file"; path: string };

export function soundChoice(value: string): DirSoundChoice {
  return parsePresetRef(value) === null ? { kind: "file", path: value } : { kind: "preset", ref: value };
}

/** The per-kind sounds the file sets, keeping only known kinds with a non-empty value — what the
 *  file schema accepts, so a save of the whole map is not refused over an entry the app ignores. */
export function soundsFromValue(value: unknown): Partial<Record<NotifyKind, string>> {
  if (!isRecord(value)) return {};
  return Object.fromEntries(NOTIFY_KINDS.flatMap((kind) => (typeof value[kind] === "string" && value[kind].trim() !== "" ? [[kind, value[kind]]] : [])));
}

/** The map with `kind` set to `sound`, or without it when `sound` is empty. */
export function withDirKindSound(sounds: Partial<Record<NotifyKind, string>>, kind: NotifyKind, sound: string): Partial<Record<NotifyKind, string>> {
  const rest: Partial<Record<NotifyKind, string>> = Object.fromEntries(Object.entries(sounds).filter(([name]) => name !== kind));
  return sound.trim() === "" ? rest : { ...rest, [kind]: sound.trim() };
}
