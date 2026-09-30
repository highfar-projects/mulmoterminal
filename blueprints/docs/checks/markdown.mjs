// The sections of a Markdown file, and whether each says anything. A heading with nothing under it is a
// promise, not a section: a guide or a report made of headings alone must not pass.

const SECTION_MARKS = ["### ", "## "];

/** Each `##` / `###` heading with the text under it up to the next heading of any depth. */
export const sectionsOf = (markdown) => {
  const sections = [];
  let current;
  markdown.split("\n").forEach((line) => {
    const mark = SECTION_MARKS.find((candidate) => line.startsWith(candidate));
    if (mark !== undefined) {
      current = { heading: line.slice(mark.length).trim(), body: [] };
      sections.push(current);
    } else if (line.startsWith("# ")) {
      current = undefined;
    } else if (current) {
      current.body.push(line);
    }
  });
  return sections.map((section) => ({ heading: section.heading, hasBody: section.body.some((line) => line.trim() !== "") }));
};

/**
 * Each wanted section (any of its names) that is missing, or present with nothing under it — named as
 * "names (empty)" in the second case. A section counts as written when any matching heading has a body.
 */
export const missingSections = (markdown, wanted) => {
  const sections = sectionsOf(markdown);
  return wanted.flatMap((names) => {
    const matching = sections.filter((section) => names.some((name) => section.heading.startsWith(name)));
    if (matching.length === 0) return [names.join(" / ")];
    return matching.some((section) => section.hasBody) ? [] : [`${names.join(" / ")} (empty)`];
  });
};

const FENCE = /^\s{0,3}(`{3,}|~{3,})/u;
const LINK_TARGET = /\]\(([^)\s]+)/gu;
const BARE_URL = /https?:\/\/[^\s)>\]]+/gu;

/**
 * What a polish must not change: the headings in order (ATX `#` lines outside code), every code block's
 * text, and every link target (Markdown links and bare URLs). Prose around them is free to change.
 */
export const skeletonOf = (markdown) => {
  const headings = [];
  const code = [];
  const links = [];
  let fence;
  let block = [];
  markdown.split("\n").forEach((line) => {
    const opening = FENCE.exec(line)?.[1];
    if (fence !== undefined) {
      if (opening !== undefined && opening[0] === fence[0] && opening.length >= fence.length) {
        code.push(block.join("\n"));
        fence = undefined;
        block = [];
      } else {
        block.push(line);
      }
      return;
    }
    if (opening !== undefined) {
      fence = opening;
      return;
    }
    if (/^#{1,6}\s/u.test(line)) headings.push(line.trim());
    [...line.matchAll(LINK_TARGET)].forEach((match) => links.push(match[1]));
    [...line.matchAll(BARE_URL)].forEach((match) => links.push(match[0]));
  });
  if (fence !== undefined) code.push(block.join("\n"));
  return { headings, code, links: [...links].sort() };
};

/** The parts of the skeleton that differ between two texts, named for the person. Empty when they agree. */
export const skeletonChanges = (before, after) => {
  const [was, now] = [skeletonOf(before), skeletonOf(after)];
  const differs = (a, b) => JSON.stringify(a) !== JSON.stringify(b);
  return [
    ...(differs(was.headings, now.headings) ? ["headings"] : []),
    ...(differs(was.code, now.code) ? ["code blocks"] : []),
    ...(differs(was.links, now.links) ? ["link targets"] : []),
  ];
};

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
