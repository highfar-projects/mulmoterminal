// The Files pane's "Open as a spreadsheet" for a CSV / TSV: read the file through the pane's own
// contained route, turn it into a workbook, and save that as a NEW spreadsheet artifact. The CSV is
// never written; the spreadsheet is a copy the user can edit, add formulas to, and chart.
import { TOOL_NAME as SPREADSHEET_TOOL } from "@gui-chat-plugin/spreadsheet/core";
import { browseQuery } from "../components/filesPaneApi";
import { jsonBody } from "../jsonBody";
import { fetchWithTimeout } from "../utils/fetchWithTimeout";
import type { CanvasCard } from "./canvasOpenFile";
import { csvSpreadsheet, MAX_SPREADSHEET_ROWS } from "./csvSpreadsheet";

// The route answers 413 for a file past its edit cap, which is far past the row limit anyway.
const TOO_LARGE_STATUS = 413;

/** Why a file did not open, as the pane's i18n key and its values. */
export interface CsvRefusal {
  key: "filesRowMenu.spreadsheetEmpty" | "filesRowMenu.spreadsheetTooLarge" | "filesRowMenu.spreadsheetFailed";
  values: Record<string, string | number>;
}

export type CsvCardResult = { kind: "card"; card: CanvasCard } | { kind: "refused"; refusal: CsvRefusal };

const refused = (key: CsvRefusal["key"], values: CsvRefusal["values"] = {}): CsvCardResult => ({ kind: "refused", refusal: { key, values } });

const tooLarge = (): CsvCardResult => refused("filesRowMenu.spreadsheetTooLarge", { max: MAX_SPREADSHEET_ROWS });

const reasonOf = (body: Record<string, unknown>, status: number): string =>
  typeof body.error === "string" && body.error !== "" ? body.error : `HTTP ${status}`;

/** The file's text, or the refusal to give instead. */
async function readCsvText(cwd: string | null, pathRel: string): Promise<string | CsvCardResult> {
  const res = await fetchWithTimeout(`/api/files/browse/text?${browseQuery(cwd, pathRel)}`);
  const body = await jsonBody(res);
  if (res.status === TOO_LARGE_STATUS) return tooLarge();
  if (!res.ok || typeof body.text !== "string") return refused("filesRowMenu.spreadsheetFailed", { reason: reasonOf(body, res.status) });
  return body.text;
}

/** Save `args` as a spreadsheet artifact; the card the Canvas draws it from. */
async function saveSpreadsheet(args: unknown): Promise<CsvCardResult> {
  const res = await fetchWithTimeout(`/api/plugin/${SPREADSHEET_TOOL}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(args),
  });
  const body = await jsonBody(res);
  const data = body.data;
  if (!res.ok || typeof data !== "object" || data === null) return refused("filesRowMenu.spreadsheetFailed", { reason: reasonOf(body, res.status) });
  const title = typeof body.title === "string" ? { title: body.title } : {};
  return { kind: "card", card: { toolName: SPREADSHEET_TOOL, data: { ...data }, ...title } };
}

/** The Canvas card for the CSV / TSV at `pathRel` under `cwd`, made by saving a spreadsheet copy. */
export async function csvSpreadsheetCard(cwd: string | null, pathRel: string): Promise<CsvCardResult> {
  try {
    const text = await readCsvText(cwd, pathRel);
    if (typeof text !== "string") return text;
    const sheet = csvSpreadsheet(text, pathRel.split("/").pop() ?? pathRel);
    if (sheet.kind === "empty") return refused("filesRowMenu.spreadsheetEmpty");
    if (sheet.kind === "too-large") return tooLarge();
    return await saveSpreadsheet(sheet.args);
  } catch (err) {
    return refused("filesRowMenu.spreadsheetFailed", { reason: err instanceof Error ? err.message : String(err) });
  }
}

/** What "Open as a spreadsheet" ended in: on the Canvas, refused (with the words to show), or
 *  dropped because the pane was moved to another cell or directory while it ran. */
export type OpenCsvOutcome = { kind: "shown" } | { kind: "refused"; refusal: CsvRefusal } | { kind: "notShown" } | { kind: "dropped" };

export interface OpenCsvDeps {
  /** Whether the pane is still beside the cell, and on the directory, it was asked from. */
  stillAsked: () => boolean;
  buildCard: () => Promise<CsvCardResult>;
  seed: (card: CanvasCard) => Promise<boolean>;
}

/** Build the copy and put it on the Canvas, re-asking after each await: the copy belongs to the
 *  cell it was asked from, and must not land on one the pane has since moved to. */
export async function openCsvAsSpreadsheet(deps: OpenCsvDeps): Promise<OpenCsvOutcome> {
  const result = await deps.buildCard();
  if (!deps.stillAsked()) return { kind: "dropped" };
  if (result.kind === "refused") return result;
  const seeded = await deps.seed(result.card);
  if (!deps.stillAsked()) return { kind: "dropped" };
  return seeded ? { kind: "shown" } : { kind: "notShown" };
}
