// The model texts a style build gathered, as plain text a person can check before the rules are written: each copy
// and where it came from. Label-free and plain, like the other gate views.

// A field meant for one line stays on one: a newline in an origin would otherwise break the list.
const oneLine = (text) =>
  String(text)
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "")
    .join(" ");

/** Each gathered text, a line each: its copy's name and where it came from. */
const sourceLine = (entry) => `- ${oneLine(entry.file)} ← ${oneLine(entry.origin)}`;

export const sourcesText = (listed) => [...listed.map(sourceLine), ""].join("\n");
