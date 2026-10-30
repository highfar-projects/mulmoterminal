// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileContains } from "../../../../server/infra/fs/file-contains.js";
import { CUSTOM_TITLE_MARK } from "../../../../server/session/session-reads.js";

let dir = "";
const write = (body: string): string => {
  const file = path.join(dir, "f.txt");
  writeFileSync(file, body);
  return file;
};

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), "mt-file-contains-"));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe("fileContains", () => {
  it("finds the text anywhere, and reports its absence", async () => {
    expect(await fileContains(write("xx custom-title yy"), "custom-title")).toBe(true);
    expect(await fileContains(write("nothing here"), "custom-title")).toBe(false);
    expect(await fileContains(write(""), "custom-title")).toBe(false);
  });

  // The needle is cut by every chunk boundary in turn, which is what the carried bytes are for.
  it("finds a match that straddles two chunks, wherever the cut falls", async () => {
    const needle = "custom-title";
    const chunkBytes = needle.length + 1;
    for (let cut = 1; cut < needle.length; cut += 1) {
      const body = `${"a".repeat(chunkBytes - cut)}${needle}${"b".repeat(9)}`;
      expect(await fileContains(write(body), needle, chunkBytes)).toBe(true);
    }
  });

  it("does not report a near miss, nor one assembled from non-adjacent chunks", async () => {
    expect(await fileContains(write("custom_title custom-titl"), "custom-title", 4)).toBe(false);
    expect(await fileContains(write(`custom-ti${"x".repeat(9)}tle`), "custom-title", 4)).toBe(false);
  });

  it("matches multi-byte text byte for byte", async () => {
    expect(await fileContains(write("前置き 題名 後ろ"), "題名", 5)).toBe(true);
  });

  it("treats an empty needle as present", async () => {
    expect(await fileContains(write("anything"), "")).toBe(true);
  });

  // The marker the transcript reader searches for must match a custom-title record and must NOT
  // match conversation that quotes one: JSON escapes the quotes inside a string.
  it("tells a custom-title record from text that mentions one", async () => {
    const record = JSON.stringify({ type: "custom-title", customTitle: "name", sessionId: "s" });
    const mention = JSON.stringify({ type: "user", message: { content: `a line like ${record} and the word custom-title` } });
    expect(await fileContains(write(`${record}\n`), CUSTOM_TITLE_MARK)).toBe(true);
    expect(await fileContains(write(`${mention}\n`), CUSTOM_TITLE_MARK)).toBe(false);
  });
});
