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

// chaff.yaml's `prefer` maps one spelling to one other: a spelling two terms would each replace cannot go in it.
const conflictingSpellings = (entries) => {
  const pairs = entries.flatMap((entry) =>
    (Array.isArray(entry?.spellings) ? entry.spellings : [])
      .filter((spelling) => hasText(entry.preferred) && spelling?.spelling !== entry.preferred)
      .map((spelling) => ({ avoided: spelling?.spelling, preferred: entry.preferred })),
  );
  return [...new Set(pairs.map((pair) => pair.avoided))]
    .filter((avoided) => new Set(pairs.filter((pair) => pair.avoided === avoided).map((pair) => pair.preferred)).size > 1)
    .map((avoided) => `「${avoided}」 would be replaced by different spellings in different terms: give it one`);
};

/** What is wrong with `glossary` ({ terms }) given `defined` ({ source, terms }[]), the definitions chaff reads. */
export const glossaryProblems = (glossary, defined) => {
  const entries = glossary?.terms;
  if (!Array.isArray(entries) || entries.length === 0) return ['the glossary needs a non-empty "terms" list'];
  const names = entries.map((entry) => entry?.term);
  const twice = [...new Set(names.filter((name, index) => hasText(name) && names.indexOf(name) !== index))].map((name) => `${name}: listed twice`);
  return [...twice, ...entries.flatMap(entryProblems), ...conflictingSpellings(entries), ...uncovered(entries, defined)];
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

const startsOf = (text, word) => {
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  return [...text.matchAll(new RegExp(escaped, "gu"))].map((match) => match.index ?? 0);
};

/**
 * Whether `text` writes `avoided` on its own: an occurrence inside an occurrence of `preferred` (ユーザ inside ユーザー)
 * is the preferred spelling, not the avoided one — and one that merely contains `preferred` (サーバー holding サーバ)
 * still counts.
 */
export const writesOnItsOwn = (text, { avoided, preferred }) => {
  const source = String(text);
  const covers = startsOf(source, preferred).map((start) => [start, start + preferred.length]);
  return startsOf(source, avoided).some((start) => !covers.some(([from, to]) => from <= start && start + avoided.length <= to));
};

/**
 * The entries of chaff.yaml's top-level `jargon:` list, block (`- 横展開`) or inline (`[横展開, 握る]`); none when the
 * file has no such list. Only this key is read: a word elsewhere in the file is not jargon.
 */
export const jargonListed = (yaml) => {
  const lines = String(yaml).split("\n");
  const at = lines.findIndex((line) => /^jargon\s*:/u.test(line));
  if (at < 0) return [];
  const clean = (item) => {
    const bare = item.split("#")[0].trim();
    const quoted = bare.length > 1 && [`"`, "'"].includes(bare[0]) && bare.at(-1) === bare[0];
    return quoted ? bare.slice(1, -1) : bare;
  };
  const value = (lines[at] ?? "").slice((lines[at] ?? "").indexOf(":") + 1).trim();
  if (value.startsWith("["))
    return value
      .slice(1, value.lastIndexOf("]"))
      .split(",")
      .map(clean)
      .filter((item) => item !== "");
  const rest = lines.slice(at + 1);
  const end = rest.findIndex((line) => line.trim() !== "" && !/^\s/u.test(line));
  return rest
    .slice(0, end < 0 ? rest.length : end)
    .map((line) => line.trim())
    .filter((line) => line.startsWith("- "))
    .map((line) => clean(line.slice(2)))
    .filter((item) => item !== "");
};
