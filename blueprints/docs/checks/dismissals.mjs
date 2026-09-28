// Findings set aside with a reason: `dismissed: [{ rule, line, because, why }]`. `because` is "wrong" when chaff
// misread the text (each becomes a draft report to chaff) or "meaning" when chaff is right but fixing it would
// change what the document says. A dismissal must match a finding chaff reports now, so nothing is invented and
// a stale line is noticed. Every usecase on the docs base that requires a clean chaff run reads them alike. Pure.

export const BECAUSE = ["wrong", "meaning"];

const matches = (dismissal, finding) => dismissal.rule === finding.rule && dismissal.line === finding.line;

/** How many of `list` are the same rule on the same line as `entry`. */
const countLike = (list, entry) => list.filter((other) => matches(entry, other)).length;

/** What is wrong with `dismissed` against the findings chaff reports now, one line each, prefixed with `label`. */
export const dismissalProblems = (label, dismissed, findings) => {
  if (dismissed === undefined) return [];
  if (!Array.isArray(dismissed)) return [`${label}: "dismissed" must be an array of { "rule", "line", "why" }`];
  return dismissed.flatMap((dismissal, index) => {
    const where = `${label}: dismissed[${index}]`;
    if (typeof dismissal?.rule !== "string" || !Number.isInteger(dismissal?.line)) return [`${where} needs "rule" and "line" as chaff reports them`];
    if (!BECAUSE.includes(dismissal.because))
      return [`${where}: "because" must be "wrong" (chaff misread it) or "meaning" (fixing it would change what it says)`];
    if (typeof dismissal.why !== "string" || !dismissal.why.trim()) return [`${where} (${dismissal.rule}, line ${dismissal.line}) needs a "why"`];
    if (!findings.some((finding) => matches(dismissal, finding))) {
      return [`${where}: chaff reports no ${dismissal.rule} on line ${dismissal.line} now (the text moved, or it was never there)`];
    }
    // One dismissal sets aside one finding: more dismissals than findings of that rule on that line is an error.
    const earlier = dismissed.slice(0, index).filter((other) => matches(dismissal, other)).length;
    return earlier < countLike(findings, dismissal)
      ? []
      : [`${where}: chaff reports only ${countLike(findings, dismissal)} ${dismissal.rule} on line ${dismissal.line}, already set aside`];
  });
};

/** The findings left once the dismissed ones are set aside. */
export const withoutDismissed = (findings, dismissed) => {
  if (!Array.isArray(dismissed)) return findings;
  // One for one: two findings of a rule on one line need two dismissals.
  const unused = [...dismissed];
  return findings.filter((finding) => {
    const at = unused.findIndex((dismissal) => matches(dismissal, finding));
    if (at === -1) return true;
    unused.splice(at, 1);
    return false;
  });
};

/**
 * The dismissals a report leaves out. Each needs a line of its own in the report that gives its rule, its line
 * number and its `why` word for word; one report line cannot stand for two dismissals.
 */
export const unreportedDismissals = (owners, reportText) => {
  const unused = reportText.split("\n");
  return owners.flatMap(({ key, dismissed }) =>
    (Array.isArray(dismissed) ? dismissed : []).flatMap((dismissal) => {
      const why = String(dismissal.why ?? "").trim();
      const at = unused.findIndex(
        (line) => line.includes(dismissal.rule) && line.includes(why) && new RegExp(`(?<!\\d)${Number(dismissal.line)}(?!\\d)`, "u").test(line),
      );
      if (at === -1) return [`${key} ${dismissal.rule} (line ${dismissal.line})`];
      unused.splice(at, 1);
      return [];
    }),
  );
};

/**
 * The draft cases for chaff from the dismissals chaff got wrong. `owners` are [{ key, file, dismissed }], one per
 * file or part; a case id is `wrong-<key>-<n>`, unique across owners.
 */
export const wrongCases = (owners) =>
  owners.flatMap(({ key, file, dismissed }) =>
    (Array.isArray(dismissed) ? dismissed : [])
      .filter((dismissal) => dismissal.because === "wrong")
      .map((dismissal, index) => ({ id: `wrong-${key}-${index + 1}`, kind: "wrong", file, rule: dismissal.rule, line: dismissal.line })),
  );
