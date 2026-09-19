// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, renameSync, utimesSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { resetFileChangePublisher } from "@mulmoclaude/core/file-change";
import { fileStamp, initFileChangePublisher, publishFileChange } from "../../../server/backends/fileChange.js";

// Capture every pubsub publish the binding makes.
interface Published {
  channel: string;
  data: unknown;
}
let published: Published[] = [];
let workspace: string;
const tempDirs: string[] = [];

function seedFile(rel: string, body = "x"): void {
  const abs = path.join(workspace, rel);
  mkdirSync(path.dirname(abs), { recursive: true });
  writeFileSync(abs, body);
}

beforeEach(() => {
  workspace = mkdtempSync(path.join(tmpdir(), "mt-fc-"));
  tempDirs.push(workspace);
  published = [];
  initFileChangePublisher({
    workspace,
    pubsub: { publish: (channel, data) => published.push({ channel, data }) },
  });
});

afterEach(() => {
  resetFileChangePublisher();
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("initFileChangePublisher", () => {
  it("forwards a markdown doc to the markdown plugin channel with its mtime", async () => {
    const rel = "artifacts/documents/2026/06/note-abc123.md";
    seedFile(rel);

    await publishFileChange(rel);

    expect(published).toHaveLength(1);
    expect(published[0].channel).toBe(`plugin:markdown:file:${rel}`);
    const payload = published[0].data as { path: string; mtimeMs: number };
    expect(payload.path).toBe(rel);
    expect(typeof payload.mtimeMs).toBe("number");
  });

  it("forwards a document OUTSIDE artifacts/documents too — the write site accepts any .md", async () => {
    const rel = "README.md";
    seedFile(rel);

    await publishFileChange(rel);

    expect(published.map((p) => p.channel)).toEqual([`plugin:markdown:file:${rel}`]);
  });

  it("forwards an html artifact to the html plugin channel", async () => {
    const rel = "artifacts/html/2026/06/page.html";
    seedFile(rel);

    await publishFileChange(rel);

    expect(published).toHaveLength(1);
    expect(published[0].channel).toBe(`plugin:html:file:${rel}`);
  });

  // The write side takes both HTML extensions and compares them case-insensitively
  // (core's classifyFilePath), so the refresh side has to as well — otherwise these
  // save and the open View never updates.
  it.each([
    ["docs/report.htm", "html"],
    ["docs/REPORT.HTML", "html"],
    ["README.MD", "markdown"],
  ])("forwards %s on the %s channel", async (rel, scope) => {
    seedFile(rel);

    await publishFileChange(rel);

    expect(published.map((p) => p.channel)).toEqual([`plugin:${scope}:file:${rel}`]);
  });

  it("forwards a shape artifact to the shapescript plugin channel", async () => {
    const rel = "artifacts/shapes/lamp-1718765432101-abcd1234.shape";
    seedFile(rel);

    await publishFileChange(rel);

    expect(published).toHaveLength(1);
    expect(published[0].channel).toBe(`plugin:shapescript:file:${rel}`);
  });

  // presentShapeScript's `path` form opens any `.shape` on disk, so the matcher has to
  // be as wide as the write site — a save that never refreshes is the failure mode.
  it("forwards a model OUTSIDE artifacts/shapes too", async () => {
    const rel = "models/bracket.shape";
    seedFile(rel);

    await publishFileChange(rel);

    expect(published.map((entry) => entry.channel)).toEqual([`plugin:shapescript:file:${rel}`]);
  });

  it("does not publish for a path that matches no scope", async () => {
    const rel = "artifacts/other/data.txt";
    seedFile(rel);

    await publishFileChange(rel);

    expect(published).toHaveLength(0);
  });

  it("drops a path that escapes the workspace", async () => {
    await publishFileChange("../escape.md");

    expect(published).toHaveLength(0);
  });
});

// What the document watcher compares each second. The case that matters is the one an AGENT
// produces: a temp file renamed over the target. mtime and size can BOTH survive that — same
// length, and a filesystem whose timestamp resolution is coarser than the gap between the two
// writes — so a stamp built from those two alone reports "unchanged" for the very edit this
// feature exists to notice (CodeRabbit on #2147).
describe("fileStamp", () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), "stamp-"));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("changes when a same-size file is renamed over the target at the same mtime", async () => {
    const target = path.join(dir, "doc.md");
    const replacement = path.join(dir, "doc.md.tmp");
    const when = new Date(1_700_000_000_000);
    writeFileSync(target, "AAAA");
    utimesSync(target, when, when);
    const before = await fileStamp(target);

    writeFileSync(replacement, "BBBB");
    utimesSync(replacement, when, when);
    renameSync(replacement, target);
    const after = await fileStamp(target);

    expect(after).not.toBe(before);
  });

  it("is stable while the file is untouched", async () => {
    const target = path.join(dir, "doc.md");
    writeFileSync(target, "AAAA");
    expect(await fileStamp(target)).toBe(await fileStamp(target));
  });

  it("changes when the content grows", async () => {
    const target = path.join(dir, "doc.md");
    writeFileSync(target, "AAAA");
    const before = await fileStamp(target);
    writeFileSync(target, "AAAAA");
    expect(await fileStamp(target)).not.toBe(before);
  });

  it("is null for a file that is not there", async () => {
    expect(await fileStamp(path.join(dir, "missing.md"))).toBeNull();
  });
});
