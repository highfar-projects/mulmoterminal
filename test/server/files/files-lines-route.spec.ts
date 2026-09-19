// @vitest-environment node
//
// GET /api/files/browse/lines — the lines around one line of a file, for the search panel's peek at
// a result (#2159).
//
// It exists instead of reusing `/text` for two reasons this file pins: `/text` rotates a backup,
// which merely LOOKING at five lines must not do, and it ships the whole file to show them. What it
// does share is `/text`'s guards, so the refusals below are the same ones every read in this file
// answers with.
import { describe, it, expect, beforeAll } from "vitest";
import { mkdirSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import express from "express";
import { routeCall } from "../../helpers/routeCall";
import { makeTempDir } from "../../support/tempDir.js";
import { mountFilesBrowseRoutes } from "../../../server/files/files-browse";
import { MAX_EDIT_BYTES } from "../../../server/files/files-browse";
import { CONTEXT_RADIUS_LINES, MAX_SNIPPET_CHARS } from "../../../common/fileSearch";
import { isRecord } from "../../../common/isRecord";

const backupRoot = makeTempDir("mt-lines-backup-");
const app = express();
mountFilesBrowseRoutes(app, { defaultCwd: process.cwd(), backupRoot });
const call = routeCall(app);

let root = "";

const lines = (pathRel: string, line: number | string) =>
  call(`/api/files/browse/lines?${new URLSearchParams({ cwd: root, path: pathRel, line: String(line) })}`);

interface WindowBody {
  from: number;
  lines: { text: string; clipped: boolean }[];
}

/** The wire shape, checked rather than asserted. The browser checks it too before drawing these
 *  lines under a line NUMBER, so pinning it here is what keeps the two ends agreeing. */
const isWindowBody = (value: unknown): value is WindowBody =>
  isRecord(value) &&
  typeof value.from === "number" &&
  Array.isArray(value.lines) &&
  value.lines.every((line: unknown) => isRecord(line) && typeof line.text === "string" && typeof line.clipped === "boolean");

const windowOf = async (pathRel: string, line: number): Promise<WindowBody> => {
  const res = await lines(pathRel, line);
  expect(res.status).toBe(200);
  if (!isWindowBody(res.body)) throw new Error(`not a line window: ${JSON.stringify(res.body)}`);
  return res.body;
};

const textsOf = (window: WindowBody): string[] => window.lines.map((line) => line.text);

beforeAll(() => {
  root = makeTempDir("mt-lines-root-");
  writeFileSync(path.join(root, "a.txt"), "one\ntwo\nthree\nfour\nfive\nsix\nseven\n");
  writeFileSync(path.join(root, "long.txt"), `${"x".repeat(MAX_SNIPPET_CHARS + 50)}\n`);
  // Bytes that do not survive being read as UTF-8 — the same refusal the editor gives (#2038).
  writeFileSync(path.join(root, "latin1.bin"), Buffer.from([0x63, 0x61, 0x66, 0xe9, 0x0a]));
  writeFileSync(path.join(root, "huge.txt"), "y".repeat(MAX_EDIT_BYTES + 1));
  mkdirSync(path.join(root, "adir"));
});

describe("GET /api/files/browse/lines", () => {
  it("answers with the lines on both sides and the number the window starts at", async () => {
    const window = await windowOf("a.txt", 4);
    expect(window.from).toBe(4 - CONTEXT_RADIUS_LINES);
    expect(textsOf(window)).toEqual(["two", "three", "four", "five", "six"]);
  });

  it("clamps at the top of the file instead of asking for line zero", async () => {
    const window = await windowOf("a.txt", 1);
    expect(window.from).toBe(1);
    expect(textsOf(window)[0]).toBe("one");
  });

  it("clamps at the bottom", async () => {
    expect(textsOf(await windowOf("a.txt", 7))).toEqual(["five", "six", "seven"]);
  });

  // A file that shrank between the search and this read has no such line. Showing its tail would
  // put text on screen under a number that does not hold it.
  it("answers with no lines for a line past the end", async () => {
    expect((await windowOf("a.txt", 99)).lines).toEqual([]);
  });

  it("cuts a very long line and marks it", async () => {
    const [only] = (await windowOf("long.txt", 1)).lines;
    expect(only?.text).toHaveLength(MAX_SNIPPET_CHARS);
    expect(only?.clipped).toBe(true);
  });

  describe("a line number that is not one", () => {
    // Refused rather than coerced: `Number("1e3")` is 1000 and `Number("")` is 0, so a lenient
    // parse answers about a line nobody asked for.
    it.each(["0", "-1", "1.5", "1e3", "", "abc", " 2", "+2"])("refuses %o", async (line) => {
      expect((await lines("a.txt", line)).status).toBe(400);
    });

    it("refuses a missing line parameter", async () => {
      expect((await call(`/api/files/browse/lines?${new URLSearchParams({ cwd: root, path: "a.txt" })}`)).status).toBe(400);
    });
  });

  describe("the guards it shares with every other read here", () => {
    it("refuses a path that escapes the project root", async () => {
      expect((await lines("../outside.txt", 1)).status).toBe(403);
    });

    it("refuses a directory", async () => {
      expect((await lines("adir", 1)).status).toBe(400);
    });

    it("refuses a file whose bytes are not UTF-8", async () => {
      expect((await lines("latin1.bin", 1)).status).toBe(415);
    });

    it("refuses a file past the read cap", async () => {
      expect((await lines("huge.txt", 1)).status).toBe(413);
    });

    it("answers a missing file with 404", async () => {
      expect((await lines("nosuchfile.txt", 1)).status).toBe(404);
    });
  });

  // THE REASON THIS IS NOT `/text`. Opening a file for editing rotates a backup, because that is
  // the last moment its content is certainly intact. Moving the selection onto a result is not that
  // moment, and reusing `/text` would rotate one on every arrow key.
  it("does not take a backup — looking at a result is not opening the file", async () => {
    const before = readdirSync(backupRoot).length;
    await lines("a.txt", 3);
    await lines("a.txt", 4);
    expect(readdirSync(backupRoot)).toHaveLength(before);
  });
});
