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
