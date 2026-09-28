// What a review found, as plain text a person can read before approving the proposals. Label-free on purpose: the
// documents may be Japanese or English, so the view is the findings' own words, quotes and places. Plain text, not
// Markdown: the quotes come from the documents, and a viewer must show them, never render them.

const SEVERITY_MARKS = { high: "●●●", medium: "●●○", low: "●○○" };

// The first line after `lead`, the rest indented under it, so a newline in the text cannot pass for the layout's own.
const led = (lead, text) =>
  String(text)
    .split("\n")
    .map((line, index) => (index === 0 ? `${lead}${line}` : `${" ".repeat(lead.length)}${line}`))
    .join("\n");

const quoted = (citation) => [...citation.quote.split("\n").map((line) => `> ${line}`), `> — ${citation.source} ${citation.address}`].join("\n");

const findingBlock = (finding) =>
  [
    `${led("", finding.summary)}\n${SEVERITY_MARKS[finding.severity] ?? finding.severity}`,
    finding.explanation,
    ...finding.citations.map(quoted),
    ...(typeof finding.proposal === "string" && finding.proposal.trim() ? [led("→ ", finding.proposal)] : []),
  ].join("\n\n");

const dismissedLine = (entry) => led("× ", `${entry.file}:${entry.line} ${entry.rule} — ${entry.why}`);

/** Each finding with its weight, explanation, quotes and proposal; then the machine findings set aside, with why. */
export function findingsText({ findings, dismissed = [] }) {
  const blocks = [...findings.map(findingBlock), ...(dismissed.length > 0 ? [dismissed.map(dismissedLine).join("\n")] : [])];
  return `${blocks.join("\n\n---\n\n")}\n`;
}
