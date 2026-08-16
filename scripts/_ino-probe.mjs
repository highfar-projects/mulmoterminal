// テストと同じ「待ちなしの連続 write→rm→write」を多数回まわし、identity が衝突する率を測る。
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
const identity = (s) => `${s.ino}:${Math.floor(s.birthtimeMs)}`;
let collide = 0, inoSame = 0, floorSame = 0;
const N = 200;
for (let i = 0; i < N; i += 1) {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "ino-"));
  const f = path.join(d, "h.jsonl");
  fs.writeFileSync(f, "a".repeat(100));
  const s1 = fs.statSync(f);
  fs.rmSync(f);
  fs.writeFileSync(f, "b".repeat(4000));
  const s2 = fs.statSync(f);
  if (s1.ino === s2.ino) inoSame += 1;
  if (Math.floor(s1.birthtimeMs) === Math.floor(s2.birthtimeMs)) floorSame += 1;
  if (identity(s1) === identity(s2)) collide += 1;
  fs.rmSync(d, { recursive: true });
}
console.log(`  platform=${process.platform}  N=${N}`);
console.log(`  ino 一致:              ${inoSame}/${N}`);
console.log(`  floor(birthtime) 一致: ${floorSame}/${N}`);
console.log(`  identity 衝突:         ${collide}/${N}   <-- これが guard を素通りする回数`);
