// Whether a file holds a byte sequence anywhere, without holding the file.
//
// A transcript reaches hundreds of MB, so this streams it and keeps only the last needle-length
// minus one bytes between chunks: that is what lets a match straddling two chunks be found.
// Raw bytes, no parsing — a hit means "the text appears", which a caller reading a record's
// `type` may treat as "look closer", never as "the record exists".
import { createReadStream } from "node:fs";

const DEFAULT_CHUNK_BYTES = 1024 * 1024;

export async function fileContains(file: string, needle: string, chunkBytes: number = DEFAULT_CHUNK_BYTES): Promise<boolean> {
  const wanted = Buffer.from(needle, "utf8");
  if (wanted.length === 0) return true;
  const input = createReadStream(file, { highWaterMark: chunkBytes });
  try {
    let carried: Buffer = Buffer.alloc(0);
    for await (const chunk of input) {
      const window = Buffer.concat([carried, chunk]);
      if (window.includes(wanted)) return true;
      carried = window.subarray(Math.max(0, window.length - (wanted.length - 1)));
    }
    return false;
  } finally {
    input.destroy();
  }
}
