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
// Where a fact was read. `placeOf` names the address for a person (第4条 ２, 「旅程」); without it, the address is shown.
const asAddress = (_source, address) => address;
const placeWith = (placeOf) => (citation) => oneLine(`${citation.source} ${placeOf(citation.source, citation.address)}`);
// A currency written as a symbol goes before the figure ($320, €50); a unit written as a word follows it (24,000 円).
const SYMBOL_BEFORE = new Set(["$", "US$", "€", "£", "¥", "￥"]);
const amountText = (entry) => {
  const unit = oneLine(entry.unit);
  const figure = entry.value.toLocaleString("en-US");
  return SYMBOL_BEFORE.has(unit) ? `${unit}${figure}` : `${figure} ${unit}`;
};

const eventLine = (place) => (event) => {
  // A weekday may be recorded with its brackets, as the document writes it, or bare.
  const weekday = (event.weekday ?? "").replace(/^[（(]|[）)]$/gu, "");
  // Brackets in the weekday's own script: 2026-10-01（金）, 2026-10-08 (Thursday).
  const english = /^[A-Za-z]/u.test(weekday);
  const bracketed = english ? `${event.date} (${weekday})` : `${event.date}（${weekday}）`;
  const day = weekday ? bracketed : event.date;
  const time = [event.start, event.end].filter(Boolean).join("–");
  return `- ${[day, time, oneLine(event.title)].filter(Boolean).join(" ")} · ${place(event.citation)}`;
};

const totalLine = (place) => (total, labels) =>
  `- ${oneLine(total.label)} ${amountText(total)} = ${total.parts.map((part) => oneLine(labels.get(part) ?? part)).join(" + ")} · ${place(total.citation)}`;

const productLine = (place) => (entry, labels) =>
  `- ${oneLine(entry.label)} ${amountText(entry)} = ${entry.of.map((id) => oneLine(labels.get(id) ?? id)).join(" × ")} · ${place(entry.citation)}`;

/** Events, amounts, totals and products, a line each, each with where it was read; the kinds apart. */
export function factsText(facts, placeOf = asAddress) {
  const place = placeWith(placeOf);
  const amounts = facts.amounts ?? [];
  const labels = new Map(amounts.map((entry) => [entry.id, entry.label]));
  const sections = [
    (facts.events ?? []).map(eventLine(place)),
    amounts.map((entry) => `- ${oneLine(entry.label)} ${amountText(entry)} · ${place(entry.citation)}`),
    (facts.totals ?? []).map((total) => totalLine(place)(total, labels)),
    (facts.products ?? []).map((entry) => productLine(place)(entry, labels)),
  ].filter((lines) => lines.length > 0);
  return `${sections.map((lines) => lines.join("\n")).join("\n\n---\n\n")}\n`;
}
