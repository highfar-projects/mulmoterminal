// The Files pane tree's own file operations (#2578): a new file or folder, a rename, and a delete
// that moves the entry to the system Trash rather than destroying it.
//
// Every one acts on the ENTRY the tree shows — a symlink is renamed or trashed as a link, never
// followed — and inside the pane's root: the path is contained lexically, its parent directory is
// contained through symlinks, and the root itself is never an entry. A rename keeps the entry in its
// directory; moving between directories is not offered.
//
// Deleting is offered only where the Trash is known: macOS's `~/.Trash`, and the freedesktop Trash on
// Linux. Elsewhere there is no delete at all, rather than a delete that cannot be undone.
import fs from "node:fs";
import path from "node:path";
import { containedPath, namesAWindowsDevice, realContainedWithin } from "./pathContainment.js";
import { isSamePath } from "../infra/path-within.js";

/** The longest name a new entry may have: what the common filesystems allow, in bytes. */
const MAX_NAME_BYTES = 255;

/** A name for an entry in one directory: no separator, no NUL, not `.` or `..`, not blank. On
 *  Windows also no `:` (an NTFS alternate stream of another file) and no device name (`CON`). */
export function validEntryName(name: unknown, platform: NodeJS.Platform = process.platform): name is string {
  if (typeof name !== "string" || name.trim() === "" || name === "." || name === "..") return false;
  if (/[/\\\0]/.test(name)) return false;
  if (platform === "win32" && (name.includes(":") || namesAWindowsDevice(name, platform))) return false;
  return Buffer.byteLength(name, "utf8") <= MAX_NAME_BYTES;
}

/** The entry `rel` names under `base`, as the tree shows it: its parent resolved through symlinks
 *  and contained, its own last component left as it is. Null when it escapes, or names the root.
 *
 *  No `~` expansion, unlike the read routes: a tree path is always relative to the base, and a
 *  folder literally named `~` (a quoted `mkdir "~/x"` leaves one) must not send a rename or a
 *  delete into the real home directory. */
export function entryUnder(base: string, rel: string, platform: NodeJS.Platform = process.platform): string | null {
  if (namesAWindowsDevice(rel, platform)) return null;
  const lexical = containedPath(base, rel);
  if (!lexical || isSamePath(lexical, path.resolve(base))) return null;
  const parent = realContainedWithin(base, path.dirname(lexical));
  return parent ? path.join(parent, path.basename(lexical)) : null;
}

/** Whether anything, a dangling symlink included, is at `abs`. */
export const entryExists = (abs: string): boolean => {
  try {
    fs.lstatSync(abs);
    return true;
  } catch {
    return false;
  }
};

export type EntryKind = "file" | "dir";

/** Make an empty file or a folder. Never over something that is there: `wx` and `mkdir` both fail
 *  on an existing name, so a race with another writer cannot turn a create into an overwrite. */
export function createEntry(abs: string, kind: EntryKind): void {
  if (kind === "dir") fs.mkdirSync(abs);
  else fs.writeFileSync(abs, "", { flag: "wx" });
}

/** Rename in place. A name that differs only in case is the same entry on a case-insensitive disk,
 *  so that one is allowed through; any other existing name is refused. */
export function renameEntry(from: string, to: string): "renamed" | "exists" {
  const sameEntry = from.toLowerCase() === to.toLowerCase() && entryExists(to) && fs.lstatSync(from).ino === fs.lstatSync(to).ino;
  if (entryExists(to) && !sameEntry) return "exists";
  fs.renameSync(from, to);
  return "renamed";
}

/** Where deleted entries go on this machine, or null where it is not known. */
export type TrashLayout = { kind: "mac"; files: string } | { kind: "freedesktop"; files: string; info: string } | null;

export function trashLayout(platform: NodeJS.Platform, env: NodeJS.ProcessEnv, homeDir: string): TrashLayout {
  if (platform === "darwin") return { kind: "mac", files: path.join(homeDir, ".Trash") };
  if (platform !== "linux") return null;
  const dataHome = env.XDG_DATA_HOME && path.isAbsolute(env.XDG_DATA_HOME) ? env.XDG_DATA_HOME : path.join(homeDir, ".local", "share");
  const trash = path.join(dataHome, "Trash");
  return { kind: "freedesktop", files: path.join(trash, "files"), info: path.join(trash, "info") };
}

/** A name not yet taken in the Trash: `a.txt`, then `a 2.txt`, `a 3.txt`, … as a file manager does. */
export function freeTrashName(name: string, taken: (candidate: string) => boolean): string {
  if (!taken(name)) return name;
  const ext = path.extname(name);
  const stem = ext && ext !== name ? name.slice(0, -ext.length) : name;
  const suffix = ext && ext !== name ? ext : "";
  for (let n = 2; ; n++) {
    const candidate = `${stem} ${n}${suffix}`;
    if (!taken(candidate)) return candidate;
  }
}

/** The freedesktop `.trashinfo` for an entry, which is what lets a file manager restore it. */
export function trashInfo(originalAbs: string, deletedAt: Date): string {
  const encoded = originalAbs.split("/").map(encodeURIComponent).join("/");
  const pad = (n: number): string => String(n).padStart(2, "0");
  const d = deletedAt;
  const date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  return `[Trash Info]\nPath=${encoded}\nDeletionDate=${date}\n`;
}

/** Move an entry into the Trash. `rename`, so an entry on another volume than the Trash is refused
 *  (EXDEV) rather than copied and deleted — a delete must not be the only copy's last step. */
export function moveToTrash(abs: string, layout: NonNullable<TrashLayout>, now: Date): "trashed" | "other-volume" {
  fs.mkdirSync(layout.files, { recursive: true, mode: 0o700 });
  if (layout.kind === "freedesktop") fs.mkdirSync(layout.info, { recursive: true, mode: 0o700 });
  const infoFor = (name: string): string | null => (layout.kind === "freedesktop" ? path.join(layout.info, `${name}.trashinfo`) : null);
  const name = freeTrashName(path.basename(abs), (candidate) => {
    const info = infoFor(candidate);
    return entryExists(path.join(layout.files, candidate)) || (info !== null && entryExists(info));
  });
  const info = infoFor(name);
  // The info file first, with `wx`: it reserves the name, and an entry in `files/` with no info is
  // one the file manager cannot put back.
  if (info) fs.writeFileSync(info, trashInfo(abs, now), { flag: "wx", mode: 0o600 });
  try {
    fs.renameSync(abs, path.join(layout.files, name));
    return "trashed";
  } catch (error) {
    if (info) fs.rmSync(info, { force: true });
    if (error instanceof Error && "code" in error && error.code === "EXDEV") return "other-volume";
    throw error;
  }
}
