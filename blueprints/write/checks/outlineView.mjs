// The outline a write build decided, as plain text a person can check before the parts are written. Label-free and
// plain, like the other gate views: the words are the outline's own, shown and never rendered.

// The first line after `lead`, the rest indented under it, so a newline in the text cannot pass for the layout's own.
const led = (lead, text) =>
  String(text)
    .split("\n")
    .map((line, index) => (index === 0 ? `${lead}${line}` : `${" ".repeat(lead.length)}${line}`))
    .join("\n");

const partBlock = (part) => [led("", part.title), led("→ ", part.file), ...part.points.map((point) => led("- ", point))].join("\n");

/** Each part: its title, the file it will be written to, and the points it will cover. */
export const outlineText = (parts) => `${parts.map(partBlock).join("\n\n---\n\n")}\n`;
