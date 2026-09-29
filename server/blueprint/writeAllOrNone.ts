// Writing several new files as one step: each is created ("wx", never over something already there), and when any
// write fails the ones this call created are removed, so the folder is left as it was found.
import { rm, writeFile } from "node:fs/promises";

export async function writeAllOrNone(writes: readonly { readonly target: string; readonly content: string | Buffer }[]): Promise<void> {
  const results = await Promise.allSettled(writes.map((write) => writeFile(write.target, write.content, { flag: "wx" })));
  const failed = results.find((result) => result.status === "rejected");
  if (!failed) return;
  await Promise.all(writes.filter((_write, index) => results[index]?.status === "fulfilled").map((write) => rm(write.target, { force: true })));
  throw failed.reason;
}
