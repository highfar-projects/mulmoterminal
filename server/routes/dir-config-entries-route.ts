// POST /api/dir-config/entries: one change to a directory's header buttons, chips or palette
// commands from the Settings form (#2727) — the same add / edit / remove / move / folder changes the
// global lists take (header-entry-changes.ts), applied to the list this directory's own files hold.
// An unconfigured list starts empty here rather than from the built-in set: a directory that says
// nothing is not claiming the defaults, it is leaving the global list in charge.
import type { Express, Request, Response } from "express";
import { existingWorkspaceFromQuery } from "../config/workspace.js";
import { isRecord } from "../../common/isRecord.js";
import { isWritableDirConfigValue } from "../config/config-schema.js";
import { dirConfigDetail, dirOwnConfigRaw } from "../config/dir/dir-config.js";
import { buttonChangeFor, chipChangeFor, withNewIdsClearOf } from "../config/header/header-entry-changes.js";
import { DEFAULT_BUTTONS, flattenEntries, sanitizeButtons, sanitizeChips } from "../config/header/header-config.js";
import { loadHeaderConfig } from "../config/header/header-context.js";
import { getHeaderConfig } from "../config/config-routes.js";
import type { DirConfigEdit } from "../../common/dirConfigForm.js";
import { writeAndAnswer, type DirConfigWriteDeps } from "./dir-config-write-route.js";

export const DIR_ENTRY_LISTS = ["buttons", "chips", "commands"] as const;
export type DirEntryList = (typeof DIR_ENTRY_LISTS)[number];
const isDirEntryList = (value: unknown): value is DirEntryList => DIR_ENTRY_LISTS.some((list) => list === value);

// The next list, the reason the request is malformed (400), or the reason the list refuses it (409,
// answered with the list as it now is).
type Outcome = { next: readonly unknown[] | null } | { badRequest: string } | { problem: string };

function outcomeFor(list: DirEntryList, action: string, body: Record<string, unknown>, raw: unknown, reserved: () => ReadonlySet<string>): Outcome {
  if (action === "reset") return { next: null };
  if (list === "chips") {
    const change = chipChangeFor(action, body);
    if (typeof change === "string") return { badRequest: change };
    // The chip helpers read an unset list as the built-in set; a directory's starts empty.
    const changed = change(sanitizeChips(raw) ?? []);
    return "problem" in changed ? { problem: changed.problem } : { next: changed.chips };
  }
  const change = buttonChangeFor(action, body, NO_DEFAULT_BUTTONS);
  if (typeof change === "string") return { badRequest: change };
  const current = sanitizeButtons(raw);
  const changed = change(current);
  if ("problem" in changed) return { problem: changed.problem };
  return { next: list === "commands" ? withNewIdsClearOf(changed.entries, current ?? [], reserved()) : changed.entries };
}

// What an unset list of a directory's buttons or commands starts from.
const NO_DEFAULT_BUTTONS: readonly [] = [];

// The ids this directory's header buttons have once the global list is merged in — the ones a palette
// command here loses to.
const buttonIdsIn = (cwd: string): ReadonlySet<string> =>
  new Set(flattenEntries(loadHeaderConfig(cwd, getHeaderConfig()).buttons ?? DEFAULT_BUTTONS).map((button) => button.id));

/** The save for a list: written when it holds anything, taken out when it is empty or reset. */
const editForList = (list: DirEntryList, next: readonly unknown[] | null): DirConfigEdit =>
  next === null || next.length === 0 ? { set: {}, unset: [list] } : { set: { [list]: next }, unset: [] };

export function mountDirConfigEntriesRoute(app: Express, deps: DirConfigWriteDeps): void {
  app.post("/api/dir-config/entries", (req, res) => {
    dirEntriesHandler(req, res, deps);
  });
}

function dirEntriesHandler(req: Request, res: Response, deps: DirConfigWriteDeps): void {
  const body: unknown = req.body ?? {};
  const fields = isRecord(body) ? body : {};
  const cwd = existingWorkspaceFromQuery(fields.cwd);
  if (!cwd || !isDirEntryList(fields.list) || typeof fields.action !== "string") {
    res.status(400).json({ error: "cwd (an existing directory), list (buttons, chips or commands) and action are required" });
    return;
  }
  const raw = dirOwnConfigRaw(cwd)[fields.list];
  const outcome = outcomeFor(fields.list, fields.action, fields, raw, () => buttonIdsIn(cwd));
  if ("badRequest" in outcome) {
    res.status(400).json({ error: outcome.badRequest });
    return;
  }
  if ("problem" in outcome) {
    res.status(409).json({ error: outcome.problem, detail: dirConfigDetail(cwd) });
    return;
  }
  // The shared helpers build only valid entries; checked anyway, because this is the write.
  if (outcome.next !== null && outcome.next.length > 0 && !isWritableDirConfigValue(fields.list, outcome.next)) {
    res.status(400).json({ error: `the ${fields.list} this change produces are not valid` });
    return;
  }
  writeAndAnswer(res, cwd, editForList(fields.list, outcome.next), deps);
}
