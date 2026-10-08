// The disk half of a Settings-form save (#2722): read the directory's two files, let
// dir-config-edit.ts work out their new text, and write only the ones that change.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { DirConfigEdit, DirFormKey } from "../../../common/dirConfigForm.js";
import { backupCurrentFile } from "../../files/backup-store.js";
import { DIR_CONFIG_FILE, DIR_LOCAL_CONFIG_FILE, mergedDirConfigRaw } from "./dir-config.js";
import { applyEditToText, isEmptyEdit, planMove, splitEditByFile } from "./dir-config-edit.js";

export type DirConfigWriteResult = { ok: true } | { ok: false; unreadable: string };

type PlannedWrite = { file: string; text: string };

/** Apply `edit` to the directory at `cwd`. Every file is worked out before any is written, so a
 *  file that cannot be read leaves both untouched rather than half the edit saved. */
export function writeDirConfigEdit(cwd: string, edit: DirConfigEdit, backupRoot: string): DirConfigWriteResult {
  const base = path.resolve(cwd);
  const { shared, local } = splitEditByFile(edit, mergedDirConfigRaw(base).localKeys);
  const targets = [
    { file: path.join(base, DIR_CONFIG_FILE), part: shared },
    { file: path.join(base, DIR_LOCAL_CONFIG_FILE), part: local },
  ];
  const plans = targets.map(({ file, part }) => ({ file, plan: planWrite(file, part) }));
  const unreadable = plans.find(({ plan }) => plan === "unreadable");
  if (unreadable) return { ok: false, unreadable: unreadable.file };
  plans.forEach(({ plan }) => {
    if (plan === null || plan === "unreadable") return;
    backupCurrentFile(plan.file, backupRoot);
    writeFileSync(plan.file, plan.text);
  });
  return { ok: true };
}

// Null when this file has nothing to do: no part of the edit, a key to remove from a file that does
// not exist (creating `{}` for it would be a file the user never asked for), or no change.
function planWrite(file: string, edit: DirConfigEdit): PlannedWrite | "unreadable" | null {
  if (isEmptyEdit(edit)) return null;
  const current = existsSync(file) ? readFileSync(file, "utf8") : null;
  if (current === null && Object.keys(edit.set).length === 0) return null;
  const text = applyEditToText(current, edit);
  if (text === null) return "unreadable";
  return text === current ? null : { file, text };
}

export type DirConfigFileRole = "shared" | "local";
export type DirConfigMoveResult = DirConfigWriteResult | { ok: false; absent: true };

const fileFor = (base: string, role: DirConfigFileRole): string => path.join(base, role === "local" ? DIR_LOCAL_CONFIG_FILE : DIR_CONFIG_FILE);
const readIfThere = (file: string): string | null => (existsSync(file) ? readFileSync(file, "utf8") : null);

/** Move `key` into the file `to` names, out of the other one — both written, or neither. */
export function moveDirConfigKey(cwd: string, key: DirFormKey, to: DirConfigFileRole, backupRoot: string): DirConfigMoveResult {
  const base = path.resolve(cwd);
  const sourceFile = fileFor(base, to === "local" ? "shared" : "local");
  const destFile = fileFor(base, to);
  const plan = planMove(readIfThere(sourceFile), readIfThere(destFile), key);
  if ("problem" in plan) return plan.problem === "absent" ? { ok: false, absent: true } : { ok: false, unreadable: sourceFile };
  [
    { file: sourceFile, text: plan.source },
    { file: destFile, text: plan.dest },
  ].forEach(({ file, text }) => {
    backupCurrentFile(file, backupRoot);
    writeFileSync(file, text);
  });
  return { ok: true };
}
