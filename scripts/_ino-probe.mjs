// 候補 3 つの識別子で衝突率を比べる（Linux の実挙動が唯一の根拠）。
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
const cands = {
  "現行 ino:floor(birth)": (s) => `${s.ino}:${Math.floor(s.birthtimeMs)}`,
  "A ino:birth（floor なし）": (s) => `${s.ino}:${s.birthtimeMs}`,
  "B ino:birth:size": (s) => `${s.ino}:${s.birthtimeMs}:${s.size}`,
  "C ino:birthNs（bigint）": (s) => `${s.ino}:${s.birthtimeNs ?? "?"}`,
};
const hits = Object.fromEntries(Object.keys(cands).map((k) => [k, 0]));
const N = 200;
for (let i = 0; i < N; i += 1) {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "ino-"));
  const f = path.join(d, "h.jsonl");
  fs.writeFileSync(f, "a".repeat(100));
  const s1 = fs.statSync(f, { bigint: true });
  fs.rmSync(f);
  fs.writeFileSync(f, "b".repeat(4000));
  const s2 = fs.statSync(f, { bigint: true });
  for (const [name, fn] of Object.entries(cands)) if (fn(s1) === fn(s2)) hits[name] += 1;
  fs.rmSync(d, { recursive: true });
}
console.log(`  platform=${process.platform} N=${N}  （衝突 = guard を素通り。0 が正しい）`);
for (const [name, n] of Object.entries(hits)) console.log(`  ${String(n).padStart(3)}/${N}  ${name}`);
