// The facts a verify build read, as Markdown a person can check before the report is written. Label-free on
// purpose: the documents may be Japanese or English, so the view is their own words, figures and places.

const place = (citation) => `${citation.source} ${citation.address}`;
const amountText = (entry) => `${entry.value.toLocaleString("en-US")} ${entry.unit}`;

const eventLine = (event) => {
  // A weekday may be recorded with its brackets, as the document writes it, or bare.
  const weekday = (event.weekday ?? "").replace(/^[（(]|[）)]$/gu, "");
  const day = weekday ? `${event.date}（${weekday}）` : event.date;
  const time = [event.start, event.end].filter(Boolean).join("–");
  return `- ${[day, time, event.title].filter(Boolean).join(" ")} · ${place(event.citation)}`;
};

const totalLine = (total, labels) =>
  `- ${total.label} ${amountText(total)} = ${total.parts.map((part) => labels.get(part) ?? part).join(" + ")} · ${place(total.citation)}`;

/** Events, amounts and totals, a line each, each with where it was read; the three kinds apart. */
export function factsMarkdown(facts) {
  const amounts = facts.amounts ?? [];
  const labels = new Map(amounts.map((entry) => [entry.id, entry.label]));
  const sections = [
    (facts.events ?? []).map(eventLine),
    amounts.map((entry) => `- ${entry.label} ${amountText(entry)} · ${place(entry.citation)}`),
    (facts.totals ?? []).map((total) => totalLine(total, labels)),
  ].filter((lines) => lines.length > 0);
  return `${sections.map((lines) => lines.join("\n")).join("\n\n---\n\n")}\n`;
}
