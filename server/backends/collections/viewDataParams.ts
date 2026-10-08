import type { Response } from "express";

function rawListEntries(value: unknown): string[] {
  if (typeof value === "string") return value.split(",");
  if (Array.isArray(value)) return value.map(String);
  return [];
}

/** A view-data list param (`?ids=a,b` or repeated `?ids=a&ids=b`) as a list, trimmed and with
 *  empty entries dropped — MulmoClaude's `parseListParam`, so a persisted view sends the same
 *  query to either host and gets the same rows back. `undefined` means "not narrowed". */
export function parseListParam(value: unknown): string[] | undefined {
  const cleaned = rawListEntries(value)
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
  return cleaned.length > 0 ? cleaned : undefined;
}

/** The manageCollection handler answers JSON on success and a bare diagnostic string on a guard
 *  failure (unknown slug, over-cap unprojected read) — the latter is the view's 400. */
export function sendToolResult(res: Response, raw: string): void {
  try {
    res.json(JSON.parse(raw));
  } catch {
    res.status(400).json({ error: raw });
  }
}
