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

// A Japanese article (第4条, 第二十一条の二): what is under it is named as Japanese law cites it.
const JA_ARTICLE = /^第[^条\s]+条/u;
const halfWidth = (digits) => digits.replace(/[０-９]/gu, (digit) => String.fromCharCode(digit.charCodeAt(0) - 0xfee0));

// Under a Japanese article, one level down is a paragraph (第2項, numbered from the address when chaff gives it no
// label) and anything deeper an item (第三号, by its label). chaff calls both "item", so the depth tells them apart.
function japaneseName(label, own, above, article) {
  const levels = own.slice(article.address.length + 1).split(".");
  if (levels.length === 1) return `${above}第${halfWidth(label ?? levels[0])}項`;
  return `${above}第${label ?? levels.at(-1)}号`;
}

// A part (an article, a section) is named by its label, or by its quoted heading when it has none (a Markdown
// section); anything below it (an item, a paragraph) adds its own label to the name of what holds it.
function nameOf(node, own, above, article) {
  const label = text(node?.attrs?.label);
  if (PARTS.has(node?.kind)) {
    const heading = text(node?.attrs?.heading);
    return label ?? (heading === null ? own : `「${heading}」`);
  }
  if (above === null) return label ?? own;
  return article?.japanese && own.startsWith(`${article.address}.`) ? japaneseName(label, own, above, article) : `${above} ${label ?? own}`;
}

const partOf = (node, own, name, article) => (PARTS.has(node?.kind) && own !== null ? { address: own, japanese: JA_ARTICLE.test(name ?? "") } : article);

const namesIn = (node, above, article) => {
  const own = text(node?.address);
  const name = own === null ? above : nameOf(node, own, above, article);
  const here = own === null ? [] : [[own, name]];
  const within = partOf(node, own, name, article);
  return [...here, ...(Array.isArray(node?.children) ? node.children.flatMap((child) => namesIn(child, name, within)) : [])];
};

/** Every address in a chaff tree, with the name a person reads for it: 第4条第2項, Section 3.2 (a) (i), 「用意するもの」. */
export const placeNamesIn = (tree) => new Map(namesIn(tree, null, null));

/** The tree of `file` (`chaff tree --format json`); null when chaff cannot read it. */
export const treeOf = (file) => {
  const run = runChaff(["tree", file, "--format", "json"]);
  if (run.code !== 0) return null;
  try {
    return JSON.parse(run.stdout);
  } catch {
    return null;
  }
};

/** The place names of `file`, by address; none when chaff cannot read its tree. */
export const placeNamesOf = (file) => placeNamesIn(treeOf(file));

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

// A heading counts only in quotation marks: a short one (期限) is also an ordinary word, and bare it would be found by accident.
const QUOTES = [
  ["「", "」"],
  ['"', '"'],
  ["“", "”"],
];

const withoutSpace = (value) => value.replace(/\s+/gu, "");

/**
 * Whether `text` names a place: by its address as written, by the quoted heading of the section at that address, or
 * by the place's name (第4条第2項, Section 3.2 (a)), spaces aside — Section 3.2(a) is the same place.
 */
export const namesPlace = (text, address, heading, name) =>
  text.includes(address.trim()) ||
  (typeof heading === "string" && heading !== "" && QUOTES.some(([open, close]) => text.includes(`${open}${heading}${close}`))) ||
  (typeof name === "string" && withoutSpace(name) !== "" && withoutSpace(text).includes(withoutSpace(name)));
