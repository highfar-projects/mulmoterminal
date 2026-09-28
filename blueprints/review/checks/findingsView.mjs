// What a review found, as Markdown a person can read before approving the proposals. Label-free on purpose: the
// documents may be Japanese or English, so the view is the findings' own words, quotes and places.

const SEVERITY_MARKS = { high: "●●●", medium: "●●○", low: "●○○" };

const quoted = (citation) => [...citation.quote.split("\n").map((line) => `> ${line}`), `> — ${citation.source} ${citation.address}`].join("\n");

const findingBlock = (finding) =>
  [
    `### ${finding.summary}`,
    SEVERITY_MARKS[finding.severity] ?? finding.severity,
    finding.explanation,
    ...finding.citations.map(quoted),
    ...(typeof finding.proposal === "string" && finding.proposal.trim() ? [`→ ${finding.proposal}`] : []),
  ].join("\n\n");

const dismissedLine = (entry) => `- ~~${entry.file}:${entry.line} ${entry.rule}~~ ${entry.why}`;

/** Each finding with its weight, explanation, quotes and proposal; then the machine findings set aside, with why. */
export function findingsMarkdown({ findings, dismissed = [] }) {
  const blocks = [...findings.map(findingBlock), ...(dismissed.length > 0 ? [dismissed.map(dismissedLine).join("\n")] : [])];
  return `${blocks.join("\n\n---\n\n")}\n`;
}
