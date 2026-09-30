// A tree shaped like `chaff tree --format json` for a text whose articles start with 第N条 on their own line, so the
// compare pack's checks can be run without chaff.
export const articleTree = (text: string) => {
  const starts = [...text.matchAll(/^第(\d+)条/gmu)].map((match) => ({ index: match.index ?? 0, number: match[1] ?? "" }));
  const children = starts.map((start, i) => {
    const end = i + 1 < starts.length ? (starts[i + 1]?.index ?? text.length) : text.length;
    return { kind: "article", address: start.number, span: { start: start.index, end }, attrs: { label: `第${start.number}条` }, children: [] };
  });
  return { kind: "doc", address: "", span: { start: 0, end: text.length }, children };
};
