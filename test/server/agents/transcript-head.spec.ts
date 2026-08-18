// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { readFirstLine, cleanTitle, parseJsonRecord } from "../../../server/agents/transcript-head.js";

describe("readFirstLine", () => {
  let dir: string;
  const write = (name: string, body: string): string => {
    const file = path.join(dir, name);
    writeFileSync(file, body);
    return file;
  };
  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), "mt-first-line-"));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("returns the first line without its newline", async () => {
    expect(await readFirstLine(write("a.jsonl", "one\ntwo\nthree\n"), 1024, 4096)).toBe("one");
  });

  // The reason this helper exists: codex writes ~20KB of session_meta on line 1, and a probe sized
  // for the common case must not answer null for a longer one (#1777).
  it("grows past the probe when the line is longer than it", async () => {
    const long = "x".repeat(5000);
    expect(await readFirstLine(write("b.jsonl", `${long}\nnext\n`), 64, 64 * 1024)).toBe(long);
  });

  it("returns null when the first line exceeds the ceiling too", async () => {
    expect(await readFirstLine(write("c.jsonl", `${"x".repeat(5000)}\n`), 64, 128)).toBeNull();
  });

  it("returns a whole file that has no trailing newline", async () => {
    expect(await readFirstLine(write("d.jsonl", "only"), 1024, 4096)).toBe("only");
  });

  it("returns null for an empty file", async () => {
    expect(await readFirstLine(write("e.jsonl", ""), 1024, 4096)).toBeNull();
  });

  it("returns an empty string for a file that starts with a newline", async () => {
    expect(await readFirstLine(write("f.jsonl", "\nsecond\n"), 1024, 4096)).toBe("");
  });

  it("returns null for a missing file", async () => {
    expect(await readFirstLine(path.join(dir, "nope.jsonl"), 1024, 4096)).toBeNull();
  });

  it("returns null for a directory", async () => {
    expect(await readFirstLine(dir, 1024, 4096)).toBeNull();
  });

  it("still reads when the ceiling is below the probe", async () => {
    expect(await readFirstLine(write("g.jsonl", "short\nrest\n"), 4096, 16)).toBe("short");
  });
});

describe("cleanTitle", () => {
  it("collapses whitespace, trims, and caps at 60 characters", () => {
    expect(cleanTitle("  a\n\tb  ", "fb")).toBe("a b");
    expect(cleanTitle("z".repeat(100), "fb")).toHaveLength(60);
  });
  it.each([null, "", "   ", "\n\t"])("falls back for %j", (raw) => {
    expect(cleanTitle(raw, "fb")).toBe("fb");
  });
});

describe("parseJsonRecord", () => {
  it("parses an object row", () => {
    expect(parseJsonRecord('{"a":1}')).toEqual({ a: 1 });
  });
  it.each(["", "not json", "{trunc", "[1,2]", '"str"', "42", "null"])("returns null for %j", (line) => {
    expect(parseJsonRecord(line)).toBeNull();
  });
});
