// A glossary gathered from documents, and what it owes them: every term the documents define is in it, every
// spelling it lists is quoted where it was found, and a term spelled more than one way says which spelling to use.
// Whether two definitions mean the same thing is a reading; that there are two is counted here.

const hasText = (value) => typeof value === "string" && value.trim() !== "";
const isCitation = (citation) =>
  citation !== null && typeof citation === "object" && hasText(citation.source) && typeof citation.address === "string" && hasText(citation.quote);

/** Every term chaff's tree reads as defined (`kind` `definition`, `attrs.term`), once each. */
export const definedTermsIn = (tree) => {
  const walk = (node) => [
    ...(node?.kind === "definition" && hasText(node.attrs?.term) ? [node.attrs.term] : []),
    ...(Array.isArray(node?.children) ? node.children.flatMap(walk) : []),
  ];
  return [...new Set(walk(tree))];
};

const entryProblems = (entry, index) => {
  if (entry === null || typeof entry !== "object" || !hasText(entry.term)) return [`entry ${index + 1} needs "term"`];
  const name = entry.term;
  const definitions = Array.isArray(entry.definitions) ? entry.definitions : [];
  const spellings = Array.isArray(entry.spellings) ? entry.spellings : [];
  const written = spellings.map((spelling) => spelling?.spelling);
  return [
    ...definitions.filter((citation) => !isCitation(citation)).map(() => `${name}: a definition needs "source", "address" and "quote"`),
    ...definitions
      .filter((citation) => isCitation(citation) && ![name, ...written].some((spelled) => hasText(spelled) && citation.quote.includes(spelled)))
      .map((citation) => `${name}: the definition quoted from ${citation.source} does not contain the term`),
    ...(spellings.length === 0 ? [`${name}: list at least one spelling found in the documents`] : []),
    ...spellings.flatMap((spelling) => {
      if (!hasText(spelling?.spelling) || !Array.isArray(spelling.citations) || spelling.citations.length === 0)
        return [`${name}: each spelling needs "spelling" and at least one quotation`];
      return spelling.citations
        .filter((citation) => !isCitation(citation) || !citation.quote.includes(spelling.spelling))
        .map(() => `${name}: a quotation for 「${spelling.spelling}」 does not contain it`);
    }),
    ...(written.length > 1 && !written.includes(entry.preferred) ? [`${name}: spelled ${written.length} ways; "preferred" must be one of them`] : []),
    ...(entry.preferred !== undefined && !written.includes(entry.preferred) ? [`${name}: "preferred" is not one of its spellings`] : []),
  ];
};

// Every definition the documents make is in the glossary, under the term or one of its spellings, from that document.
const uncovered = (entries, defined) =>
  defined.flatMap(({ source, terms }) =>
    terms
      .filter(
        (term) =>
          !entries.some(
            (entry) =>
              (entry.term === term || (entry.spellings ?? []).some((spelling) => spelling?.spelling === term)) &&
              (entry.definitions ?? []).some((citation) => citation?.source === source),
          ),
      )
      .map((term) => `${source} defines 「${term}」, which the glossary does not give with its definition there`),
  );

/** What is wrong with `glossary` ({ terms }) given `defined` ({ source, terms }[]), the definitions chaff reads. */
export const glossaryProblems = (glossary, defined) => {
  const entries = glossary?.terms;
  if (!Array.isArray(entries) || entries.length === 0) return ['the glossary needs a non-empty "terms" list'];
  const names = entries.map((entry) => entry?.term);
  const twice = [...new Set(names.filter((name, index) => hasText(name) && names.indexOf(name) !== index))].map((name) => `${name}: listed twice`);
  return [...twice, ...entries.flatMap(entryProblems), ...uncovered(entries, defined)];
};

/** Every quotation in the glossary, for chaff cite. */
export const citationsOf = (glossary) =>
  (glossary?.terms ?? []).flatMap((entry) => [...(entry.definitions ?? []), ...(entry.spellings ?? []).flatMap((spelling) => spelling.citations ?? [])]);

/** The terms defined more than once. */
export const definedTwice = (glossary) => (glossary?.terms ?? []).filter((entry) => (entry.definitions ?? []).length > 1).map((entry) => entry.term);

/** The spellings to avoid, each with the one to use: what chaff.yaml's `prefer` takes. */
export const avoidedSpellings = (glossary) =>
  (glossary?.terms ?? []).flatMap((entry) =>
    (entry.spellings ?? [])
      .filter((spelling) => entry.preferred !== undefined && spelling.spelling !== entry.preferred)
      .map((spelling) => ({ avoided: spelling.spelling, preferred: entry.preferred })),
  );

/** The terms marked as only understood inside: what chaff.yaml's `jargon` takes. */
export const jargonOf = (glossary) => (glossary?.terms ?? []).filter((entry) => entry.jargon === true).map((entry) => entry.term);
