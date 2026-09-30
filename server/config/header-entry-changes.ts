// What one Settings request does to a list of header buttons or chips, decided from the request alone
// (#2622, #2727). The global routes apply it to the config's lists and a directory's route to that
// directory's, so the two cannot disagree about what "move this button" or "add this chip" means.
//
// Each returns the change to apply to the CURRENT list, or the reason the request cannot say one.
import { entriesMoved, entriesWithAdded, isEditableRun, type ButtonDraft, type ButtonProblem } from "../../common/headerButtonEntries.js";
import {
  entriesIntoFolder,
  entriesOutOfFolder,
  entriesWithEditedAnywhere,
  entriesWithFolderEdited,
  entriesWithoutAnywhere,
  type EntryShape,
  type FolderDestination,
} from "../../common/headerButtonFolders.js";
import { chipsMoved, chipsWithAdded, chipsWithout, isChipEntry, type ChipEntry } from "../../common/headerChips.js";

export type ButtonsChanged = { entries: readonly EntryShape[] } | { problem: ButtonProblem };
export type ChipsChanged = { chips: ChipEntry[] } | { problem: string };

type ButtonChange = (current: readonly EntryShape[] | null) => ButtonsChanged;
type ChipChange = (current: readonly ChipEntry[] | null) => ChipsChanged;

const text = (value: unknown): string => (typeof value === "string" ? value : "");

function draftFrom(body: Record<string, unknown>): ButtonDraft | null {
  if (!isEditableRun(body.run)) return null;
  return { label: text(body.label), icon: text(body.icon), run: body.run, payload: text(body.payload), target: text(body.target), when: text(body.when) };
}

const RUN_REQUIRED = "run must be shell, input, open or action";
const ID_REQUIRED = "id is required";

/** The button change `action` asks for. `defaults` is what an unconfigured list means: the built-in
 *  set for the global buttons, nothing for a directory's. */
export function buttonChangeFor(action: string, body: Record<string, unknown>, defaults: readonly EntryShape[]): ButtonChange | string {
  const id = text(body.id);
  if (action === "add" || action === "edit") return draftChangeFor(action, body, defaults, id);
  if (action === "move") return moveChangeFor(body, defaults, id);
  if (!id) return ID_REQUIRED;
  if (action === "remove") return (current) => entriesWithoutAnywhere(current, defaults, id);
  return folderChangeFor(action, body, defaults, id);
}

function draftChangeFor(action: "add" | "edit", body: Record<string, unknown>, defaults: readonly EntryShape[], id: string): ButtonChange | string {
  const draft = draftFrom(body);
  if (action === "add") return draft === null ? RUN_REQUIRED : (current) => entriesWithAdded(current, defaults, draft);
  if (!id || draft === null) return "id and a run of shell, input, open or action are required";
  return (current) => entriesWithEditedAnywhere(current, defaults, id, draft);
}

function moveChangeFor(body: Record<string, unknown>, defaults: readonly EntryShape[], id: string): ButtonChange | string {
  const { delta } = body;
  if (!id || (delta !== -1 && delta !== 1)) return "id and a delta of -1 or 1 are required";
  return (current) => entriesMoved(current, defaults, id, delta);
}

function folderChangeFor(action: string, body: Record<string, unknown>, defaults: readonly EntryShape[], id: string): ButtonChange | string {
  if (action === "into-folder") {
    const folderId = text(body.folderId);
    const destination: FolderDestination = folderId ? { folderId } : { label: text(body.folderLabel), icon: text(body.folderIcon) };
    return (current) => entriesIntoFolder(current, defaults, id, destination);
  }
  if (action === "out-of-folder") return (current) => entriesOutOfFolder(current, defaults, id);
  if (action === "folder-edit") {
    const fields = { label: text(body.label), icon: text(body.icon), when: text(body.when) };
    return (current) => entriesWithFolderEdited(current, defaults, id, fields);
  }
  return `unknown action: ${action}`;
}

/** The chip change `action` asks for. A remove or move names the chip the caller saw at that index,
 *  so a list that changed since it loaded is refused rather than acted on by position. */
export function chipChangeFor(action: string, body: Record<string, unknown>): ChipChange | string {
  if (action === "add") {
    const draft = { builtin: text(body.builtin), label: text(body.label), text: text(body.text), when: text(body.when) };
    return (current) => chipsWithAdded(current, draft);
  }
  const { index, chip, delta } = body;
  if (action === "remove")
    return typeof index === "number" && isChipEntry(chip) ? (current) => chipsWithout(current, index, chip) : "index and chip are required";
  if (action === "move") {
    const valid = typeof index === "number" && isChipEntry(chip) && (delta === -1 || delta === 1);
    return valid ? (current) => chipsMoved(current, index, delta, chip) : "index, chip and a delta of -1 or 1 are required";
  }
  return `unknown action: ${action}`;
}
