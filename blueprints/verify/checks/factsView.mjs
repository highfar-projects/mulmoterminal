// The facts a verify build read, as plain text a person can check before the report is written. Label-free on
// purpose: the documents may be Japanese or English, so the view is their own words, figures and places. Plain
// text, not Markdown: the words come from the documents, and a viewer must show them, never render them.

// A field meant for one line stays on one: a newline in a document's title would otherwise break the list.
const oneLine = (text) =>
  String(text)
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "")
    .join(" ");
const place = (citation) => oneLine(`${citation.source} ${citation.address}`);
const amountText = (entry) => `${entry.value.toLocaleString("en-US")} ${oneLine(entry.unit)}`;

const eventLine = (event) => {
  // A weekday may be recorded with its brackets, as the document writes it, or bare.
  const weekday = (event.weekday ?? "").replace(/^[（(]|[）)]$/gu, "");
  const day = weekday ? `${event.date}（${weekday}）` : event.date;
  const time = [event.start, event.end].filter(Boolean).join("–");
  return `- ${[day, time, oneLine(event.title)].filter(Boolean).join(" ")} · ${place(event.citation)}`;
};

const totalLine = (total, labels) =>
  `- ${oneLine(total.label)} ${amountText(total)} = ${total.parts.map((part) => oneLine(labels.get(part) ?? part)).join(" + ")} · ${place(total.citation)}`;

/** Events, amounts and totals, a line each, each with where it was read; the three kinds apart. */
export function factsText(facts) {
  const amounts = facts.amounts ?? [];
  const labels = new Map(amounts.map((entry) => [entry.id, entry.label]));
  const sections = [
    (facts.events ?? []).map(eventLine),
    amounts.map((entry) => `- ${oneLine(entry.label)} ${amountText(entry)} · ${place(entry.citation)}`),
    (facts.totals ?? []).map((total) => totalLine(total, labels)),
  ].filter((lines) => lines.length > 0);
  return `${sections.map((lines) => lines.join("\n")).join("\n\n---\n\n")}\n`;
}
