// Where a quotation sits, named for the person who reads it: a section of a Markdown document by its heading,
// since chaff's address for it (h1.3) tells nobody anything. Other addresses (第4条第2項, 3.1) already read as the
// document writes them.
import { runChaff } from "./chaff.mjs";

const sectionsIn = (node) => [
  ...(node?.kind === "section" && typeof node.address === "string" && typeof node.attrs?.heading === "string" ? [[node.address, node.attrs.heading]] : []),
  ...(Array.isArray(node?.children) ? node.children.flatMap(sectionsIn) : []),
];

/** Every section address in a chaff tree (`tree --format json`), with its heading. */
export const headingsIn = (tree) => new Map(sectionsIn(tree));

/** The section headings of `file`, by address; none when chaff cannot read its tree. */
export const headingsOf = (file) => {
  const run = runChaff(["tree", file, "--format", "json"]);
  if (run.code !== 0) return new Map();
  try {
    return headingsIn(JSON.parse(run.stdout));
  } catch {
    return new Map();
  }
};

// A heading counts only in quotation marks: a short one (期限) is also an ordinary word, and bare it would be found by accident.
const QUOTES = [
  ["「", "」"],
  ['"', '"'],
  ["“", "”"],
];

/** Whether `text` names a place: by its address as written, or by the quoted heading of the section at that address. */
export const namesPlace = (text, address, heading) =>
  text.includes(address.trim()) ||
  (typeof heading === "string" && heading !== "" && QUOTES.some(([open, close]) => text.includes(`${open}${heading}${close}`)));
