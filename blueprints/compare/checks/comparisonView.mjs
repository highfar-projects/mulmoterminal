// The pairing as plain text a person reads at the gate: one line a pair, the old article first. The marks are the
// ones a diff uses, so they read the same in any language: "=" unchanged, "~" changed, "+" added, "-" removed.

const MARKS = { same: "=", changed: "~", added: "+", removed: "-" };

const labelOf = (articles, address) => (typeof address === "string" ? (articles.find((article) => article.address === address)?.label ?? address) : "");

const lineOf = (row, olds, news) => {
  const pair = `${labelOf(olds, row.old)} → ${labelOf(news, row.new)}`.trim();
  const what = typeof row.what === "string" && row.what.trim() !== "" ? `  ${row.what.split("\n").join(" ").trim()}` : "";
  return `${MARKS[row.change] ?? "?"} ${pair}${what}`;
};

export const comparisonText = (rows, olds, news) => [...rows.map((row) => lineOf(row, olds, news)), ""].join("\n");
