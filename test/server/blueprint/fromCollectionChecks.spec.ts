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

// The import check, run as the executor runs it: `yarn import-source` into a fresh database twice, then the database is
// read directly and held against the copied records. The project here is a stand-in whose import script is written to
// be right, or wrong in one particular way.
const IMPORT_CHECK = path.join(PACKS, "from-collection/checks/import.sh");

const BOOKS_SCHEMA = {
  primaryKey: "id",
  fields: {
    id: { type: "string" },
    title: { type: "string" },
    lent: { type: "boolean" },
    pages: { type: "number" },
    cover: { type: "image" },
    author: { type: "ref", to: "authors" },
    score: { type: "derived" },
  },
};
const AUTHORS_SCHEMA = { primaryKey: "id", fields: { id: { type: "string" }, name: { type: "string" } } };
const BOOKS = [
  { id: "b1", title: "One", lent: true, pages: 120, cover: "images/b1.png", author: "a1" },
  { id: "b2", title: "Two", lent: false, author: "a1" },
];
const AUTHORS = [{ id: "a1", name: "Ann" }];

// The stand-in import: `flaws` names what it gets wrong.
const importScript = (flaws: readonly string[]) => `
import { DatabaseSync } from "node:sqlite";
import { copyFileSync, mkdirSync, readFileSync } from "node:fs";
const flaws = ${JSON.stringify(flaws)};
const db = new DatabaseSync(process.argv[2]);
const books = flaws.includes("wrong-table") ? "book" : "books";
const pk = flaws.includes("no-primary-key") ? "" : " PRIMARY KEY";
db.exec(\`CREATE TABLE IF NOT EXISTS authors (id TEXT PRIMARY KEY, name TEXT)\`);
db.exec(\`CREATE TABLE IF NOT EXISTS \${books} (id TEXT\${pk}, title TEXT, lent INTEGER, pages REAL, cover TEXT, author TEXT)\`);
const read = (slug) => readFileSync(\`.blueprint/source/collections/\${slug}/records.jsonl\`, "utf8").split("\\n").filter(Boolean).map((line) => JSON.parse(line));
for (const a of read("authors")) db.prepare("INSERT OR REPLACE INTO authors VALUES (?, ?)").run(a.id, a.name);
const rows = read("books").filter((b) => !(flaws.includes("drop-one") && b.id === "b2"));
for (const b of rows) {
  const lent = flaws.includes("boolean-as-text") ? String(b.lent) : b.lent ? 1 : 0;
  const title = flaws.includes("wrong-value") && b.id === "b1" ? "Uno" : b.title;
  db.prepare(\`INSERT OR REPLACE INTO \${books} VALUES (?, ?, ?, ?, ?, ?)\`).run(b.id, title, lent, b.pages ?? null, b.cover ?? null, b.author);
  if (b.cover && !flaws.includes("no-file")) {
    mkdirSync("data/files/images", { recursive: true });
    copyFileSync(\`.blueprint/source/files/\${b.cover}\`, \`data/files/\${b.cover}\`);
  }
}
`;

const standIn = (flaws: readonly string[] = [], records = true) => {
  const put = (file: string, content: string) => {
    mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
    writeFileSync(path.join(dir, file), content);
  };
  const jsonl = (items: readonly object[]) => items.map((item) => `${JSON.stringify(item)}\n`).join("");
  put(".blueprint/source/source.json", JSON.stringify({ from: "collection", start: "books", collections: ["books", "authors"], missing: [], records }));
  put(".blueprint/source/collections/books/schema.json", JSON.stringify(BOOKS_SCHEMA));
  put(".blueprint/source/collections/authors/schema.json", JSON.stringify(AUTHORS_SCHEMA));
  put(".blueprint/source/collections/books/records.jsonl", jsonl(BOOKS));
  put(".blueprint/source/collections/authors/records.jsonl", jsonl(AUTHORS));
  put(".blueprint/source/files/images/b1.png", "png");
  put("import.mjs", importScript(flaws));
  put("package.json", JSON.stringify({ name: "stand-in", private: true, scripts: { "import-source": "node --no-warnings import.mjs", test: "node -e 0" } }));
};

const runImportCheck = () => {
  const run = spawnSync("/bin/sh", [IMPORT_CHECK], {
    cwd: dir,
    env: { ...process.env, BLUEPRINT_USECASE: path.join(PACKS, "from-collection") },
    encoding: "utf8",
  });
  return { status: run.status, stderr: run.stderr, stdout: run.stdout };
};

// Each case runs `yarn` several times (the import twice, then the tests), which a loaded runner takes seconds over.
const IMPORT_CHECK_TIMEOUT_MS = 90_000;

describeSh("from-collection: the import check", { timeout: IMPORT_CHECK_TIMEOUT_MS }, () => {
  it("passes when every record, field and file is in the database and data/files/", () => {
    standIn();
    expect(runImportCheck()).toMatchObject({ status: 0 });
  });

  it.each([
    ["a record left out", ["drop-one"], "has 1 rows, the source had 2 records"],
    ["a value changed", ["wrong-value"], 'title is "Uno", the source had "One"'],
    ["a boolean kept as text", ["boolean-as-text"], 'lent is "true", the source had true'],
    ["a file not copied", ["no-file"], "points at images/b1.png, which is not in data/files/"],
    ["a second run adding the rows again", ["no-primary-key"], "has 4 rows, the source had 2 records"],
    ["a table named otherwise", ["wrong-table"], "there is no table books"],
  ])("fails on %s, and says what", (_label, flaws, message) => {
    standIn(flaws);
    const result = runImportCheck();
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(message);
  });

  it("passes without running anything when only the shape was copied", () => {
    standIn(["drop-one"], false);
    const result = runImportCheck();
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("only the shape was copied");
  });
});

// The Firebase import check starts the emulators, which these specs do not; the branches before that are checked here.
// The emulator run itself is covered by firestoreVerify.spec.ts (the reader) and was run for real when this landed.
describeSh("from-collection: the Firebase import check, before the emulators", () => {
  const FIREBASE_IMPORT_CHECK = path.join(PACKS, "from-collection/checks/import-firebase.sh");
  const runFirebaseCheck = (target: string) =>
    spawnSync("/bin/sh", [FIREBASE_IMPORT_CHECK, target], {
      cwd: dir,
      env: { ...process.env, BLUEPRINT_BASE: path.join(PACKS, "firebase"), BLUEPRINT_USECASE: path.join(PACKS, "from-collection") },
      encoding: "utf8",
    });

  it("passes without starting anything when only the shape was copied", () => {
    standIn([], false);
    const result = runFirebaseCheck("emulator");
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("only the shape was copied");
  });

  it("refuses a target it does not know", () => {
    standIn();
    const result = runFirebaseCheck("staging");
    expect(result.status).toBe(2);
    expect(result.stderr).toContain("usage: import-firebase.sh emulator|prod");
  });

  it("fails before the emulators when there is no import script", () => {
    standIn();
    writeFileSync(path.join(dir, "package.json"), JSON.stringify({ name: "stand-in", private: true, scripts: {} }));
    const result = runFirebaseCheck("emulator");
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("package.json has no import-source script");
  });
});
