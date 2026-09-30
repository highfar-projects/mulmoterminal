// Two versions of a document, article by article: each article's body as chaff's tree spans it, and whether the
// pairing an agent wrote says the truth about them. What changed is read by the agent; whether anything changed
// at all is decided here, by comparing text, so "unchanged" cannot be written over a changed article or the
// other way round.

export const CHANGES = ["same", "changed", "added", "removed"];

// Spacing aside: a reflowed line is not a change to what an article says.
const squash = (text) => String(text).replace(/\s+/gu, "");

const articleNodes = (node) => [
  ...(node?.kind === "article" && typeof node.address === "string" && node.address !== "" ? [node] : []),
  ...(Array.isArray(node?.children) ? node.children.flatMap(articleNodes) : []),
];

// The article's own number (第4条, Article 4) is where it sits, not what it says: a renumbered article is the same.
const withoutLabel = (text, label) => {
  const trimmed = text.trimStart();
  return typeof label === "string" && label !== "" && trimmed.startsWith(label) ? trimmed.slice(label.length) : trimmed;
};

/** Each article of `text` as `tree` (chaff tree --format json) reads it: its address, label and body. */
export const articlesIn = (tree, text) =>
  articleNodes(tree).map((node) => {
    const whole = String(text).slice(node.span?.start ?? 0, node.span?.end ?? 0);
    return { address: node.address, label: node.attrs?.label ?? node.address, body: squash(withoutLabel(whole, node.attrs?.label)) };
  });

const rowShape = (row, index) => {
  if (row === null || typeof row !== "object") return `row ${index + 1} is not an object`;
  if (!CHANGES.includes(row.change)) return `row ${index + 1}: "change" must be one of ${CHANGES.join(", ")}`;
  const has = (side) => typeof row[side] === "string" && row[side] !== "";
  const wanted = { same: [true, true], changed: [true, true], added: [false, true], removed: [true, false] }[row.change];
  if (has("old") !== wanted[0] || has("new") !== wanted[1])
    return `row ${index + 1}: a "${row.change}" row has ${wanted[0] ? "an" : "no"} "old" and ${wanted[1] ? "a" : "no"} "new"`;
  if (row.change === "changed" && !(typeof row.what === "string" && row.what.trim() !== "")) return `row ${index + 1}: say in "what" what changed`;
  return null;
};

// Every article of a version in exactly one row, and no row naming one that is not there.
const coverage = (rows, articles, side, version) => {
  const named = rows.map((row) => row[side]).filter((address) => typeof address === "string" && address !== "");
  const known = articles.map((article) => article.address);
  return [
    ...known.filter((address) => !named.includes(address)).map((address) => `${version} ${labelOf(articles, address)}: in no row`),
    ...[...new Set(named.filter((address, index) => named.indexOf(address) !== index))].map(
      (address) => `${version} ${labelOf(articles, address)}: in more than one row`,
    ),
    ...named.filter((address) => !known.includes(address)).map((address) => `${version} has no article at ${address}`),
  ];
};

const labelOf = (articles, address) => articles.find((article) => article.address === address)?.label ?? address;

// A pair said to be the same must read the same, and one said to have changed must not.
const truth = (row, olds, news) => {
  if (row.change !== "same" && row.change !== "changed") return null;
  const [was, now] = [olds.find((article) => article.address === row.old), news.find((article) => article.address === row.new)];
  if (!was || !now) return null;
  const pair = `${labelOf(olds, row.old)} → ${labelOf(news, row.new)}`;
  if (row.change === "same" && was.body !== now.body) return `${pair}: written "same", but the text differs`;
  if (row.change === "changed" && was.body === now.body) return `${pair}: written "changed", but the text is the same`;
  return null;
};

// A provision removed from the old version and added to the new one word for word is one that moved: a pair missed.
const missedPairs = (rows, olds, news) => {
  const bodyOf = (articles, address) => articles.find((article) => article.address === address)?.body;
  const added = rows.filter((row) => row.change === "added").map((row) => row.new);
  return rows
    .filter((row) => row.change === "removed")
    .flatMap((row) => {
      const body = bodyOf(olds, row.old);
      const twin = added.find((address) => body !== undefined && bodyOf(news, address) === body);
      return twin === undefined ? [] : [`${labelOf(olds, row.old)} (removed) and ${labelOf(news, twin)} (added) read the same: pair them as "same"`];
    });
};

/** What is wrong with `rows` (the pairing) for the articles `olds` and `news`. */
export const comparisonProblems = (rows, olds, news) => {
  if (!Array.isArray(rows)) return ['the pairing needs a "rows" list'];
  const shapes = rows.map(rowShape).filter((problem) => problem !== null);
  if (shapes.length > 0) return shapes;
  return [
    ...coverage(rows, olds, "old", "the old version"),
    ...coverage(rows, news, "new", "the new version"),
    ...rows.map((row) => truth(row, olds, news)).filter((problem) => problem !== null),
    ...missedPairs(rows, olds, news),
  ];
};

// What goes on to make another article's number: a digit (Article 12), a branch number (第1条の2, 第二十一条の二,
// Article 1-2, Article 1.2). "の" with anything else is prose: 「第1条の委託料」 still names 第1条.
const CONTINUES = /^(?:[0-9０-９]|[の之ノ][0-9０-９一二三四五六七八九十百千]|[-.‐－．][0-9０-９])/u;

/** Whether `text` names the article `name`, and not only another article whose number starts the same. */
export const mentions = (text, name) =>
  String(text)
    .split(name)
    .slice(1)
    .some((after) => !CONTINUES.test(after));

const headingLevel = (line) => /^(#{1,6}) /u.exec(line)?.[1].length ?? 0;

/**
 * The text under the first `##` or `###` heading starting with one of `names` (the depths a report's sections may
 * have), up to the next heading at the same depth or above. Empty when there is none.
 */
export const sectionText = (markdown, names) => {
  const lines = String(markdown).split("\n");
  const start = lines.findIndex((line) => [2, 3].includes(headingLevel(line)) && names.some((name) => line.replace(/^#+ /u, "").trim().startsWith(name)));
  if (start < 0) return "";
  const depth = headingLevel(lines[start] ?? "");
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => headingLevel(line) > 0 && headingLevel(line) <= depth);
  return rest.slice(0, end < 0 ? rest.length : end).join("\n");
};
