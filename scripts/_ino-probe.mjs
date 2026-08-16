import fs from "node:fs";
import os from "node:os";
import path from "node:path";
const cands = {
  "現行  ino:floor(birthMs)": (n, b) => `${n.ino}:${Math.floor(n.birthtimeMs)}`,
  "A     ino:birthMs（floor なし）": (n, b) => `${n.ino}:${n.birthtimeMs}`,
  "B     ino:floor(birthMs):size": (n, b) => `${n.ino}:${Math.floor(n.birthtimeMs)}:${n.size}`,
  "C     ino:birthtimeNs": (n, b) => `${b.ino}:${b.birthtimeNs}`,
};
const hits = Object.fromEntries(Object.keys(cands).map((k) => [k, 0]));
const N = 200;
for (let i = 0; i < N; i += 1) {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "ino-"));
  const f = path.join(d, "h.jsonl");
  fs.writeFileSync(f, "a".repeat(100));
  const n1 = fs.statSync(f), b1 = fs.statSync(f, { bigint: true });
  fs.rmSync(f);
  fs.writeFileSync(f, "b".repeat(4000));
  const n2 = fs.statSync(f), b2 = fs.statSync(f, { bigint: true });
  for (const [name, fn] of Object.entries(cands)) if (fn(n1, b1) === fn(n2, b2)) hits[name] += 1;
  fs.rmSync(d, { recursive: true });
}
console.log(`  platform=${process.platform} N=${N}  （衝突 = guard 素通り。0 が正しい）`);
for (const [name, n] of Object.entries(hits)) console.log(`  ${String(n).padStart(3)}/${N}  ${name}`);
