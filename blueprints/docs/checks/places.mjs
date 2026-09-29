// Where a quotation sits, named for the person who reads it: a section of a Markdown document by its heading,
// since chaff's address for it (h1.3) tells nobody anything. Other addresses (第4条第2項, 3.1) already read as the
// document writes them.
import { runChaff } from "./chaff.mjs";

const sectionsIn = (node) => [
  ...(node?.kind === "section" && typeof node.address === "string" && typeof node.attrs?.heading === "string" ? [[node.address, node.attrs.heading]] : []),
  ...(Array.isArray(node?.children) ? node.children.flatMap(sectionsIn) : []),
];

const PARTS = new Set(["section", "article"]);

const text = (value) => (typeof value === "string" && value !== "" ? value : null);

// A part (an article, a section) is named by its label, or by its quoted heading when it has none (a Markdown
// section); anything below it (an item, a paragraph) adds its own label to the name of what holds it.
function nameOf(node, own, above) {
  const label = text(node?.attrs?.label);
  if (PARTS.has(node?.kind)) {
    const heading = text(node?.attrs?.heading);
    return label ?? (heading === null ? own : `「${heading}」`);
  }
  return above === null ? (label ?? own) : `${above} ${label ?? own}`;
}

const namesIn = (node, above) => {
  const own = text(node?.address);
  const name = own === null ? above : nameOf(node, own, above);
  const here = own === null ? [] : [[own, name]];
  return [...here, ...(Array.isArray(node?.children) ? node.children.flatMap((child) => namesIn(child, name)) : [])];
};

/** Every address in a chaff tree, with the name a person reads for it: 第4条 ２, Section 3.2 (a) (i), 「用意するもの」. */
export const placeNamesIn = (tree) => new Map(namesIn(tree, null));

/** The place names of `file`, by address; none when chaff cannot read its tree. */
export const placeNamesOf = (file) => {
  const run = runChaff(["tree", file, "--format", "json"]);
  if (run.code !== 0) return new Map();
  try {
    return placeNamesIn(JSON.parse(run.stdout));
  } catch {
    return new Map();
  }
};

/**
 * Where a citation sits, for a view a person reads: its place name from the document's tree, read once per document
 * and only for one of `documents` (through `sourcePath`, which resolves or refuses a source); the address itself
 * when there is no name.
 */
export const placeNamer = (sourcePath) => {
  const cache = new Map();
  return (source, address) => {
    const resolved = sourcePath(source);
    if (!resolved.path) return address;
    if (!cache.has(resolved.path)) cache.set(resolved.path, placeNamesOf(resolved.path));
    return cache.get(resolved.path).get(String(address).trim()) ?? address;
  };
};

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
