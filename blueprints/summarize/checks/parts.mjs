// What a summary must answer for, and what it may not invent. A document's parts are the units a summary may not
// silently drop; a sentence's numbers must come from the quotations that back it.

const SECTIONS = new Set(["section", "chapter", "part"]);
const addressed = (node) => typeof node?.address === "string" && node.address !== "";
const childrenOf = (node) => (Array.isArray(node?.children) ? node.children : []);

const articlesUnder = (node) => [...(node?.kind === "article" && addressed(node) ? [node] : []), ...childrenOf(node).flatMap(articlesUnder)];

// The first level with more than one section: a document under a single title heading is divided by what is under it.
const sectionLevel = (node) => {
  const sections = childrenOf(node).filter((child) => SECTIONS.has(child.kind) && addressed(child));
  return sections.length === 1 && childrenOf(sections[0]).some((child) => SECTIONS.has(child.kind) && addressed(child)) ? sectionLevel(sections[0]) : sections;
};

const nameOf = (node) => {
  const label = node.attrs?.label;
  if (typeof label === "string" && label !== "") return label;
  const heading = node.attrs?.heading;
  return typeof heading === "string" && heading !== "" ? heading : node.address;
};

/** The parts of a document as `tree` (chaff tree --format json) reads it: its articles if it has any, else its sections. */
export const partsIn = (tree) => {
  const articles = articlesUnder(tree);
  const units = articles.length > 0 ? articles : sectionLevel(tree);
  return units.map((node) => ({ address: node.address, name: nameOf(node) }));
};

/** Whether a quotation at `address` is in the part at `part`: the part itself, or anything numbered under it. */
export const within = (address, part) => address === part || String(address).startsWith(`${part}.`);

const WIDE = /[０-９，．]/gu;
const narrow = (text) => text.replace(WIDE, (char) => String.fromCharCode(char.charCodeAt(0) - 0xfee0));

// A run of digits, commas and points as the number it writes: separators out, a sentence's full stop and a zero
// fraction off ("20,000" is 20000, "25." is 25, "3.0" is 3).
const tidied = (run) => {
  const digits = run.replaceAll(",", "");
  const bare = digits.slice(0, [...digits].findLastIndex((char) => char !== ".") + 1);
  const [whole, fraction] = bare.split(".");
  return fraction === undefined || /^0+$/u.test(fraction) ? whole : bare;
};

/** The numbers written in `text`, width and thousands separators aside: 「20,000円」 and 「２００００円」 are both 20000. */
export const numbersIn = (text) => [...narrow(String(text)).matchAll(/\d[\d,.]*/gu)].map((match) => tidied(match[0]));

const hasText = (value) => typeof value === "string" && value.trim() !== "";

const sentenceShape = (sentence, index) => {
  if (sentence === null || typeof sentence !== "object" || !hasText(sentence.text)) return `sentence ${index + 1} needs "text"`;
  if (!Array.isArray(sentence.citations) || sentence.citations.length === 0) return `sentence ${index + 1} needs at least one quotation in "citations"`;
  return null;
};

// Every number a sentence states is in a quotation backing it, or in the name of a place it cites (第4条 says 4).
const inventedNumbers = (sentence, index, nameOf) => {
  const allowed = new Set(
    sentence.citations.flatMap((citation) => [...numbersIn(citation?.quote ?? ""), ...numbersIn(nameOf(citation?.source, citation?.address) ?? "")]),
  );
  const invented = [...new Set(numbersIn(sentence.text).filter((number) => !allowed.has(number)))];
  return invented.length === 0 ? [] : [`sentence ${index + 1} states ${invented.join(", ")}, which no quotation backing it says`];
};

// Every part of every document is cited by some sentence, or left out on purpose with a reason — never both.
const coverageProblems = (sentences, omitted, documents) => {
  const cited = sentences.flatMap((sentence) => sentence.citations);
  return documents.flatMap((document) =>
    document.parts.flatMap((part) => {
      const citedHere = cited.some((citation) => citation?.source === document.source && within(String(citation?.address), part.address));
      const left = omitted.find((entry) => entry?.source === document.source && entry?.address === part.address);
      if (citedHere && left) return [`${document.source} ${part.name}: both cited and left out`];
      if (citedHere) return [];
      if (!left) return [`${document.source} ${part.name}: no sentence cites it, and it is not in "omitted"`];
      return hasText(left.why) ? [] : [`${document.source} ${part.name}: left out without a reason in "why"`];
    }),
  );
};

const strayOmissions = (omitted, documents) =>
  omitted
    .filter((entry) => !documents.some((document) => document.source === entry?.source && document.parts.some((part) => part.address === entry?.address)))
    .map((entry) => `"omitted" names ${entry?.source} ${entry?.address}, which is not a part of it`);

/**
 * What is wrong with `summary` ({ sentences, omitted }) for `documents` ({ source, parts }[]) at most `maxSentences`
 * long (null for no limit). `nameOf(source, address)` is a place's name as a person reads it.
 */
export const summaryProblems = (summary, documents, maxSentences, nameOf) => {
  const sentences = summary?.sentences;
  if (!Array.isArray(sentences) || sentences.length === 0) return ['the summary needs a non-empty "sentences" list'];
  const shapes = sentences.map(sentenceShape).filter((problem) => problem !== null);
  if (shapes.length > 0) return shapes;
  const omitted = Array.isArray(summary.omitted) ? summary.omitted : [];
  return [
    ...(maxSentences !== null && sentences.length > maxSentences ? [`${sentences.length} sentences, more than the ${maxSentences} agreed`] : []),
    ...sentences.flatMap((sentence, index) => inventedNumbers(sentence, index, nameOf)),
    ...coverageProblems(sentences, omitted, documents),
    ...strayOmissions(omitted, documents),
  ];
};
