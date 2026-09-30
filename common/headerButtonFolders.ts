import { slugFromLabel, uniqueSlug } from "./agentEntries.js";
import {
  BUTTON_LABEL_MAX,
  MAX_HEADER_BUTTONS,
  entriesWithEdited,
  entriesWithout,
  isIconName,
  type ButtonDraft,
  type ButtonProblem,
} from "./headerButtonEntries.js";

// Folders in the header's buttons as Settings changes them (#2622). A folder is one row-2 icon that
// opens a menu of ordinary buttons; it holds at least one (the loader drops an empty one) and only
// buttons, never another folder. So a folder is made by putting a button into it, and taking out its
// last button removes it.
//
// Structural, not the server's zod types, so both sides can call these: the loader's optional fields
// may be present and undefined, which the shapes allow.

export interface ButtonShape {
  id: string;
  label: string;
  run: string;
  order?: number | undefined;
  emoji?: string | undefined;
  icon?: string | undefined;
  when?: string | undefined;
  cmd?: string | undefined;
  text?: string | undefined;
  open?: object | undefined;
  action?: string | undefined;
}

export interface FolderShape {
  id: string;
  label: string;
  items: readonly ButtonShape[];
  order?: number | undefined;
  emoji?: string | undefined;
  icon?: string | undefined;
  when?: string | undefined;
}

export type EntryShape = ButtonShape | FolderShape;
export const isFolderShape = (entry: EntryShape): entry is FolderShape => "items" in entry;

type Changed = { entries: EntryShape[] } | { problem: ButtonProblem };

/** Where a button goes: an existing folder, or a new one named here. */
export type FolderDestination = { folderId: string } | { label: string; icon: string };

export interface FolderFields {
  label: string;
  icon: string;
  when: string;
}

const allIds = (entries: readonly EntryShape[]): string[] =>
  entries.flatMap((entry) => [entry.id, ...(isFolderShape(entry) ? entry.items.map((child) => child.id) : [])]);

/** The folder holding button `id`, with the button's index in it, or null for a top-level id. */
function holderOf(entries: readonly EntryShape[], id: string): { folder: FolderShape; index: number } | null {
  const folder = entries.find((entry): entry is FolderShape => isFolderShape(entry) && entry.items.some((child) => child.id === id));
  return folder ? { folder, index: folder.items.findIndex((child) => child.id === id) } : null;
}

const withFolder = (entries: readonly EntryShape[], folder: FolderShape): EntryShape[] =>
  folder.items.length === 0 ? entries.filter((entry) => entry.id !== folder.id) : entries.map((entry) => (entry.id === folder.id ? folder : entry));

/** Remove button `id` wherever it is — at the top, or inside a folder, which goes when it empties. */
export function entriesWithoutAnywhere(current: readonly EntryShape[] | null, defaults: readonly EntryShape[], id: string): Changed {
  const entries = current ?? defaults;
  const held = holderOf(entries, id);
  if (held === null) return entriesWithout<EntryShape>(entries, defaults, id);
  return { entries: withFolder(entries, { ...held.folder, items: held.folder.items.filter((child) => child.id !== id) }) };
}

/** Edit button `id` wherever it is, keeping its id, `order` and `emoji`. */
export function entriesWithEditedAnywhere(current: readonly EntryShape[] | null, defaults: readonly EntryShape[], id: string, draft: ButtonDraft): Changed {
  const entries = current ?? defaults;
  const held = holderOf(entries, id);
  if (held === null) return entriesWithEdited<EntryShape>(entries, defaults, id, draft);
  const edited = entriesWithEdited<ButtonShape>(held.folder.items, [], id, draft);
  if ("problem" in edited) return edited;
  return { entries: withFolder(entries, { ...held.folder, items: edited.entries }) };
}

function newFolder(entries: readonly EntryShape[], destination: { label: string; icon: string }, first: ButtonShape): FolderShape | ButtonProblem {
  const label = destination.label.trim();
  const icon = destination.icon.trim();
  if (!label || label.length > BUTTON_LABEL_MAX) return "label";
  if (icon && !isIconName(icon)) return "icon";
  const taken = allIds(entries);
  const id = uniqueSlug(slugFromLabel(label) || "folder", (candidate) => !taken.includes(candidate), taken.length + 2) ?? "folder";
  return icon ? { id, label, icon, items: [first] } : { id, label, items: [first] };
}

/** Put top-level button `id` into a folder — an existing one (at its end), or a new one made where
 *  the button was. */
export function entriesIntoFolder(current: readonly EntryShape[] | null, defaults: readonly EntryShape[], id: string, destination: FolderDestination): Changed {
  const entries = current ?? defaults;
  const button = entries.find((entry): entry is ButtonShape => entry.id === id && !isFolderShape(entry));
  if (button === undefined) return { problem: entries.some((entry) => entry.id === id) ? "folder" : "missing" };
  if ("folderId" in destination) {
    const folder = entries.find((entry): entry is FolderShape => entry.id === destination.folderId && isFolderShape(entry));
    if (folder === undefined) return { problem: "missing" };
    if (folder.items.length >= MAX_HEADER_BUTTONS) return { problem: "full" };
    return { entries: withFolder(entries, { ...folder, items: [...folder.items, button] }).filter((entry) => entry.id !== id) };
  }
  const made = newFolder(entries, destination, button);
  if (typeof made === "string") return { problem: made };
  return { entries: entries.map((entry) => (entry.id === id ? made : entry)) };
}

/** Take button `id` out of its folder, placing it right after the folder — or in its place, when it
 *  was the folder's last button. */
export function entriesOutOfFolder(current: readonly EntryShape[] | null, defaults: readonly EntryShape[], id: string): Changed {
  const entries = current ?? defaults;
  const held = holderOf(entries, id);
  const button = held?.folder.items[held.index];
  if (held === null || button === undefined) return { problem: "missing" };
  const rest = held.folder.items.filter((child) => child.id !== id);
  if (rest.length > 0 && entries.length >= MAX_HEADER_BUTTONS) return { problem: "full" };
  const folder: FolderShape = { ...held.folder, items: rest };
  return {
    entries: entries.flatMap((entry) => {
      if (entry.id !== folder.id) return [entry];
      return rest.length === 0 ? [button] : [folder, button];
    }),
  };
}

/** A folder's own name, icon and condition. Its buttons and id stay. */
export function entriesWithFolderEdited(current: readonly EntryShape[] | null, defaults: readonly EntryShape[], id: string, fields: FolderFields): Changed {
  const entries = current ?? defaults;
  const folder = entries.find((entry): entry is FolderShape => entry.id === id && isFolderShape(entry));
  if (folder === undefined) return { problem: "missing" };
  const label = fields.label.trim();
  const icon = fields.icon.trim();
  const when = fields.when.trim();
  if (!label || label.length > BUTTON_LABEL_MAX) return { problem: "label" };
  if (icon && !isIconName(icon)) return { problem: "icon" };
  const edited: FolderShape = { id, label, items: folder.items };
  if (icon) edited.icon = icon;
  if (when) edited.when = when;
  if (folder.order !== undefined) edited.order = folder.order;
  if (folder.emoji !== undefined) edited.emoji = folder.emoji;
  return { entries: entries.map((entry) => (entry.id === id ? edited : entry)) };
}
