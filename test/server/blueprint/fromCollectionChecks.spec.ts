// @vitest-environment node
// The from-collection spec check, run as the executor runs it (the local base's spec.sh, with the usecase pack named):
// every field, view, action and ingest of every copied collection must be named with its collection, so a key two
// collections share cannot vouch for both.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const PACKS = path.join(import.meta.dirname, "..", "..", "..", "blueprints");
const describeSh = describe.skipIf(process.platform === "win32");

let dir = "";
beforeEach(() => {
  dir = mkdtempSync(path.join(os.tmpdir(), "bp-from-collection-"));
  const put = (file: string, content: unknown) => {
    mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
    writeFileSync(path.join(dir, file), typeof content === "string" ? content : JSON.stringify(content));
  };
  put(".blueprint/source/source.json", {
    from: "collection",
    start: "books",
    collections: ["books", "authors"],
    missing: [],
    takenAt: "2026-09-29T00:00:00.000Z",
  });
  put(".blueprint/source/collections/books/schema.json", {
    fields: { id: {}, title: {} },
    views: [{ id: "board" }],
    actions: [{ id: "tidy" }],
    collectionActions: [{ id: "help" }],
  });
  put(".blueprint/source/collections/authors/schema.json", { fields: { id: {}, name: {} }, ingest: { kind: "rss" } });
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const quoted = (token: string): string => "`" + token + "`";

const EVERY = ["books.id", "books.title", "books.views.board", "books.actions.tidy", "books.actions.help", "authors.id", "authors.name", "authors.ingest"];

const check = (spec: string) => {
  writeFileSync(path.join(dir, ".blueprint/spec.md"), spec);
  const run = spawnSync("/bin/sh", [path.join(PACKS, "local/checks/spec.sh")], {
    cwd: dir,
    env: { ...process.env, BLUEPRINT_BASE: path.join(PACKS, "local"), BLUEPRINT_USECASE: path.join(PACKS, "from-collection") },
    encoding: "utf8",
  });
  return { status: run.status, stderr: run.stderr };
};

describeSh("from-collection: the spec check", () => {
  it("passes when everything is named with its collection", () => {
    expect(check(EVERY.map((token) => `- ${quoted(token)}`).join("\n"))).toMatchObject({ status: 0 });
  });

  it("fails when a key both collections share is named for only one of them", () => {
    const result = check(
      EVERY.filter((token) => token !== "authors.id")
        .map(quoted)
        .join(" "),
    );
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("authors.id");
    expect(result.stderr).not.toContain("books.id");
  });

  it("fails when an ingest is dropped", () => {
    const result = check(
      EVERY.filter((token) => token !== "authors.ingest")
        .map(quoted)
        .join(" "),
    );
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("authors.ingest");
  });

  it("fails on bare keys, and on names left outside backquotes", () => {
    expect(check("`id` `title` `name` `board` `tidy` `help`").status).toBe(1);
    expect(check(EVERY.join(" ")).status).toBe(1);
  });

  it("fails with the template's own message when a placeholder is left, before looking at the source", () => {
    const result = check(`{{appName}} ${EVERY.map(quoted).join(" ")}`);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("unfilled placeholders");
  });

  it("fails when the build was started without a collection", () => {
    rmSync(path.join(dir, ".blueprint/source"), { recursive: true });
    const result = check(EVERY.map(quoted).join(" "));
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("source.json");
  });
});
