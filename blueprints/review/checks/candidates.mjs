// The cases worth reporting to chaff, from the review's findings: a structure problem chaff reported that the
// review dismissed (wrong), and a structure finding the review made that chaff did not report (missed). Pure.
import { normalize } from "node:path";

const STRUCTURE_RULES = ["dangling-reference", "numbering-gap", "duplicate-definition"];

/** The 1-based line a quotation starts on, ignoring spaces and line breaks as chaff cite does; undefined when absent. */
export const lineOfQuote = (text, quote) => {
  // Code units on both sides, so the offset indexOf returns is an index into `kept` even past an emoji.
  const chars = String(text).split("");
  const kept = chars.flatMap((char, index) => (/\s/u.test(char) ? [] : [{ char, index }]));
  const needle = String(quote).replace(/\s/gu, "");
  if (needle === "") return undefined;
  const at = kept
    .map((entry) => entry.char)
    .join("")
    .indexOf(needle);
  if (at === -1) return undefined;
  return chars.slice(0, kept[at].index).filter((char) => char === "\n").length + 1;
};

const wrongCases = (dismissed) =>
  dismissed.map((entry, index) => ({
    id: `wrong-${index + 1}`,
    kind: "wrong",
    file: normalize(entry.file),
    rule: entry.rule,
    line: entry.line,
  }));

/** `textOf(file)` reads a document; a missed case whose quotation cannot be placed is left out. */
const missedCases = (findings, textOf) =>
  findings
    .filter((finding) => STRUCTURE_RULES.includes(finding.kind) && finding.machine === undefined)
    .flatMap((finding) => {
      const [citation] = finding.citations;
      const file = normalize(citation.source);
      const line = lineOfQuote(textOf(file), citation.quote);
      return line === undefined ? [] : [{ id: `missed-${finding.id}`, kind: "missed", file, rule: finding.kind, line }];
    });

/** Every case to draft a report for, in a stable order: wrong ones first, then missed ones. */
export const feedbackCases = ({ findings, dismissed }, textOf) => [...wrongCases(dismissed), ...missedCases(findings, textOf)];
