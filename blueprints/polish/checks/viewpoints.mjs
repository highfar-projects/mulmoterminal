// What a kind of document is read for beyond chaff's findings (viewpoints.json), and the record the polish step
// keeps of it: for every polished file, each of the kind's viewpoints once, as "ok", "fixed" (only where the
// catalog lets the polish fix it without adding a fact) or "writer" (a question for the person who wrote it).
// A quotation ties each verdict to the text, so a verdict cannot be recorded for a place that is not there.

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export const VERDICTS = ["ok", "fixed", "writer"];
export const RECORD = ".blueprint/viewpoints.json";

/** The catalog in the pack at `usecaseDir`. */
export const readCatalog = (usecaseDir) => JSON.parse(readFileSync(join(usecaseDir, "viewpoints.json"), "utf8"));

/** The folder's record ({ file: entries }); an empty one before anything is recorded, and for a record that is not an object. */
export const readRecord = () => {
  if (!existsSync(RECORD)) return {};
  const record = JSON.parse(readFileSync(RECORD, "utf8"));
  return record !== null && typeof record === "object" && !Array.isArray(record) ? record : {};
};

// Line breaks and spacing aside: a quotation copied across a wrapped line is still the same words. A blank line is
// not spacing: it ends a paragraph, and words from two paragraphs are not a quotation of either.
const squash = (text) => String(text).replace(/\s+/gu, "");
const hasText = (value) => typeof value === "string" && squash(value) !== "";
const BLANK_LINE = /\n[^\S\n]*\n/u;
const blocksOf = (text) => String(text).split(BLANK_LINE);

/** Whether `quote` is in `text`, within one paragraph or block, spacing and wrapping aside. */
export const quotedIn = (quote, text) => hasText(quote) && blocksOf(text).some((block) => squash(block).includes(squash(quote)));

/** The viewpoint ids for `genre` in `catalog`; none without a genre or for a genre the catalog does not cover. */
export const viewpointsFor = (catalog, genre) => (genre ? (catalog.genres?.[genre] ?? []) : []);

const quoted = (entry, text) => quotedIn(entry.quote, text);

// A fix the catalog allows, quoting what was there and is there no longer.
const fixedProblems = (entry, catalog, original, current) => {
  if (catalog.viewpoints[entry.id]?.fix !== "may") return ["this is the writer's to settle, not a fix the polish may make"];
  if (!hasText(entry.quote)) return ["a fix needs the quotation of what was there"];
  if (!quoted(entry, original)) return ["the quotation is not in the original"];
  return quoted(entry, current) ? ["the quotation is still in the document, so nothing was fixed"] : [];
};

// A question for the writer, about a place that is in the document.
const writerProblems = (entry, current) => {
  if (!hasText(entry.quote)) return ["a question for the writer needs the quotation it is about"];
  if (!quoted(entry, current)) return ["the quotation is not in the document"];
  return hasText(entry.note) ? [] : ['a question for the writer needs the question, in "note"'];
};

const entryProblems = (entry, catalog, original, current) => {
  const problems = () => {
    if (!VERDICTS.includes(entry.verdict)) return [`verdict must be one of ${VERDICTS.join(", ")}`];
    if (entry.verdict === "fixed") return fixedProblems(entry, catalog, original, current);
    if (entry.verdict === "writer") return writerProblems(entry, current);
    return entry.quote === undefined || quoted(entry, current) ? [] : ["the quotation is not in the document"];
  };
  return problems().map((problem) => `${entry.id}: ${problem}`);
};

/**
 * What is wrong with `entries`, the record for `file`, when its kind is read for `ids`. `original` and `current` are
 * the file's text before and after polishing.
 */
export const viewpointProblems = ({ file, ids, catalog, entries, original, current }) => {
  if (ids.length === 0) return [];
  if (!Array.isArray(entries)) return [`${file}: no viewpoints recorded; record each of: ${ids.join(", ")}`];
  const shaped = entries.filter((entry) => entry !== null && typeof entry === "object" && typeof entry.id === "string");
  const seen = shaped.map((entry) => entry.id);
  const unknown = seen.filter((id) => !ids.includes(id));
  const twice = seen.filter((id, index) => seen.indexOf(id) !== index);
  const missing = ids.filter((id) => !seen.includes(id));
  return [
    ...(shaped.length === entries.length ? [] : ["an entry is not { id, verdict, quote?, note? }"]),
    ...unknown.map((id) => `${id}: not one of this kind's viewpoints`),
    ...[...new Set(twice)].map((id) => `${id}: recorded twice`),
    ...missing.map((id) => `${id}: not recorded`),
    ...shaped.filter((entry) => ids.includes(entry.id)).flatMap((entry) => entryProblems(entry, catalog, original, current)),
  ].map((problem) => `${file}: ${problem}`);
};

/** The questions for the writer across `record` ({ file: entries }), in file order. */
export const writerItems = (record) =>
  Object.entries(record ?? {}).flatMap(([file, entries]) =>
    (Array.isArray(entries) ? entries : []).filter((entry) => entry?.verdict === "writer").map((entry) => ({ file, ...entry })),
  );

/** The text under the first `## ` heading starting with one of `names`, up to the next `#` or `##` heading. */
export const sectionText = (markdown, names) => {
  const lines = String(markdown).split("\n");
  const start = lines.findIndex((line) => line.startsWith("## ") && names.some((name) => line.slice(3).trim().startsWith(name)));
  if (start < 0) return "";
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => /^#{1,2} /u.test(line));
  return rest.slice(0, end < 0 ? rest.length : end).join("\n");
};

const occurrences = (haystack, needle) => haystack.split(needle).length - 1;

/**
 * The writer's questions `section` (the report's part for them) does not carry: each needs its file named and its
 * quotation word for word — as many times as there are questions quoting it.
 */
export const unreportedWriterItems = (items, section) => {
  const flat = squash(section);
  return items
    .filter((item, index) => {
      const same = items.slice(0, index + 1).filter((other) => squash(other.quote) === squash(item.quote)).length;
      return !section.includes(item.file) || occurrences(flat, squash(item.quote)) < same;
    })
    .map((item) => `${item.file} ${item.id}`);
};
