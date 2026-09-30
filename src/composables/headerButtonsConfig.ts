import { ref } from "vue";
import { draftOfEntry, isButtonProblem, type ButtonDraft, type ButtonProblem } from "../../common/headerButtonEntries";
import { isRecord } from "../../common/isRecord";
import { isUnknownArray } from "../../common/isUnknownArray";
import { postEntryChange, type EntryChange } from "./configEntryChange";
import { setHeaderButtonCount } from "./headerConfigSummary";
import { headerConfigRevision } from "./headerConfigRevision";

// The global header buttons as Settings lists them (#2622): what each entry is called and what it
// does, not the entry itself — only the server builds and checks one. `null` is "unconfigured": the
// header shows the built-in set.
export type ButtonKind = "shell" | "input" | "open" | "action" | "folder";

export interface ButtonRow {
  id: string;
  label: string;
  kind: ButtonKind;
  /** The command, the text, or how many buttons a folder holds — what the row shows under its name. */
  detail: string;
  /** Placed by its `order` number rather than by where it sits, so it is not moved from here. */
  ordered: boolean;
  /** The entry as the form shows it for editing, or null when the form cannot (a folder, or an
   *  `open` naming more than one target). */
  draft: ButtonDraft | null;
}

const KINDS: readonly ButtonKind[] = ["shell", "input", "open", "action"];
const isKind = (value: unknown): value is ButtonKind => KINDS.some((kind) => kind === value);
const text = (value: unknown): string => (typeof value === "string" ? value : "");

// What a row shows under its name: the command, the text, the action's name, or what it opens.
function detailOf(entry: Record<string, unknown>): string {
  if (entry.run === "shell") return text(entry.cmd);
  if (entry.run === "input") return text(entry.text);
  if (entry.run === "action") return text(entry.action);
  if (!isRecord(entry.open)) return "";
  return Object.entries(entry.open)
    .map(([kind, value]) => (value === true ? kind : `${kind}: ${text(value)}`))
    .join(", ");
}

function rowOf(entry: unknown): ButtonRow | null {
  if (!isRecord(entry) || typeof entry.id !== "string" || typeof entry.label !== "string") return null;
  const ordered = typeof entry.order === "number";
  if (isUnknownArray(entry.items)) return { id: entry.id, label: entry.label, kind: "folder", detail: String(entry.items.length), ordered, draft: null };
  if (!isKind(entry.run)) return null;
  return { id: entry.id, label: entry.label, kind: entry.run, detail: detailOf(entry), ordered, draft: draftOfEntry(entry) };
}

export const globalHeaderButtons = ref<ButtonRow[] | null>(null);

export function setGlobalHeaderButtons(value: unknown): void {
  globalHeaderButtons.value = isUnknownArray(value) ? value.map(rowOf).filter((row): row is ButtonRow => row !== null) : null;
}

export type ButtonAction = "add" | "edit" | "remove" | "move" | "reset";

export async function changeHeaderButtons(action: ButtonAction, payload: Record<string, unknown>): Promise<EntryChange<ButtonProblem>> {
  const change = await postEntryChange(`/api/config/buttons/${action}`, payload, isButtonProblem);
  // A refusal answers the list as it is on disk: shown, so a tab that was behind catches up.
  if (change.body !== null && "buttons" in change.body) {
    setGlobalHeaderButtons(change.body.buttons);
    setHeaderButtonCount(change.body.buttons);
  }
  if (change.ok) headerConfigRevision.value += 1;
  return change;
}
