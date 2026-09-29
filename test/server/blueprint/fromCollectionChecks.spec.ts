// @vitest-environment node
// The from-collection spec check, run as the executor runs it (the local base's spec.sh, with the usecase pack named):
// every field, view, action and ingest of every copied collection must be named with its collection, so a key two
// collections share cannot vouch for both.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
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
    actions: [
      { id: "tidy", kind: "agent" },
      { id: "done", kind: "mutate" },
    ],
    collectionActions: [{ id: "help", kind: "chat" }],
  });
  put(".blueprint/source/collections/authors/schema.json", { fields: { id: {}, name: {} }, ingest: { kind: "rss" } });
  put(ACTIONS_FILE, { actions: DECISIONS });
});

const ACTIONS_FILE = ".blueprint/actions.json";
// What the spec decided for the fixture's actions and ingest: one of each kind of decision.
const DECISIONS = [
  { name: "books.actions.tidy", kind: "agent", decision: "feature", how: "summarise with Claude" },
  { name: "books.actions.done", kind: "mutate", decision: "feature", how: "a button" },
  { name: "books.actions.help", kind: "chat", decision: "drop", how: "the app explains itself" },
  { name: "authors.ingest", kind: "rss", decision: "manual", how: "paste new authors by hand" },
];
const decide = (entries: readonly object[]) => writeFileSync(path.join(dir, ACTIONS_FILE), JSON.stringify({ actions: entries }));
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const quoted = (token: string): string => "`" + token + "`";

const EVERY = [
  "books.id",
  "books.title",
  "books.views.board",
  "books.actions.tidy",
  "books.actions.done",
  "books.actions.help",
  "authors.id",
  "authors.name",
  "authors.ingest",
];

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

  describe("from a shared app", () => {
    const APP = {
      aid: "aid-1",
      members: { "owner@example.com": { "*": "owner" } },
      collections: { books: { statusField: "state" }, authors: {} },
      public: { submit: { books: { auth: "verifiedEmail" } }, view: { path: "/" } },
      views: [{ id: "board", audience: "member" }],
    };
    const APP_TOKENS = ["app.members", "app.collections.books", "app.collections.authors", "app.public.submit.books", "app.public.view", "app.views.board"];
    const asApp = (from: string) => {
      writeFileSync(
        path.join(dir, ".blueprint/source/source.json"),
        JSON.stringify({ from, start: "Library", collections: ["books", "authors"], missing: [] }),
      );
      writeFileSync(path.join(dir, ".blueprint/source/app.json"), JSON.stringify(APP));
    };

    it("passes when every part of the declaration is named too", () => {
      asApp("app");
      expect(check([...EVERY, ...APP_TOKENS].map(quoted).join(" ")).status).toBe(0);
    });

    it("fails when a part of the declaration is not named, and says which", () => {
      asApp("app");
      const result = check([...EVERY, ...APP_TOKENS.filter((token) => token !== "app.public.submit.books")].map(quoted).join(" "));
      expect(result.status).toBe(1);
      expect(result.stderr).toContain("app.public.submit.books");
    });

    it("asks nothing of the declaration when the source is a collection", () => {
      asApp("collection");
      expect(check(EVERY.map(quoted).join(" ")).status).toBe(0);
    });
  });

  describe("the decisions for actions and ingests", () => {
    const everything = () => EVERY.map(quoted).join(" ");

    it("fails when they are not recorded at all", () => {
      rmSync(path.join(dir, ACTIONS_FILE));
      const result = check(everything());
      expect(result.status).toBe(1);
      expect(result.stderr).toContain(".blueprint/actions.json is missing");
    });

    it.each([
      ["one left out", DECISIONS.slice(1), "books.actions.tidy has 0 entries"],
      ["one decided twice", [...DECISIONS, DECISIONS[0]], "books.actions.tidy has 2 entries"],
      ["a decision that is not one of the three", [{ ...DECISIONS[0], decision: "later" }, ...DECISIONS.slice(1)], 'decision "later"'],
      ["a mutate not built", [DECISIONS[0], { ...DECISIONS[1], decision: "manual" }, ...DECISIONS.slice(2)], "books.actions.done is a mutate"],
      ["a name the source does not have", [...DECISIONS, { name: "books.actions.ghost", decision: "drop" }], '"books.actions.ghost" is not an action'],
      ["a kind that is not the source's", [{ ...DECISIONS[0], kind: "chat" }, ...DECISIONS.slice(1)], 'recorded as kind "chat"; the source has it as "agent"'],
      ["a kind left out", [{ name: "books.actions.tidy", decision: "feature" }, ...DECISIONS.slice(1)], "recorded as kind undefined"],
    ])("fails on %s, and says what", (_label, entries, message) => {
      decide(entries);
      const result = check(everything());
      expect(result.status).toBe(1);
      expect(result.stderr).toContain(message);
    });

    it("fails when a source action has no kind, whatever the record says", () => {
      writeFileSync(
        path.join(dir, ".blueprint/source/collections/books/schema.json"),
        JSON.stringify({
          fields: { id: {}, title: {} },
          views: [{ id: "board" }],
          actions: [{ id: "tidy" }, { id: "done", kind: "mutate" }],
          collectionActions: [{ id: "help", kind: "chat" }],
        }),
      );
      decide([{ name: "books.actions.tidy", decision: "drop" }, ...DECISIONS.slice(1)]);
      const result = check(everything());
      expect(result.status).toBe(1);
      expect(result.stderr).toContain("books.actions.tidy has no kind");
    });

    it.each([
      ["not JSON", "{actions"],
      ["without an actions list", JSON.stringify({ actions: "none" })],
    ])("fails when the record is %s", (_label, content) => {
      writeFileSync(path.join(dir, ACTIONS_FILE), content);
      const result = check(everything());
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('is not JSON with an "actions" list');
    });

    it("asks for no decisions when the source has no actions or ingests", () => {
      writeFileSync(
        path.join(dir, ".blueprint/source/collections/books/schema.json"),
        JSON.stringify({ fields: { id: {}, title: {} }, views: [{ id: "board" }] }),
      );
      writeFileSync(path.join(dir, ".blueprint/source/collections/authors/schema.json"), JSON.stringify({ fields: { id: {}, name: {} } }));
      rmSync(path.join(dir, ACTIONS_FILE));
      expect(check(["books.id", "books.title", "books.views.board", "authors.id", "authors.name"].map(quoted).join(" ")).status).toBe(0);
    });
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

// The actions step's check: every decision to build has a test naming it and the tests pass; every decision left to a
// person is in the README. The stand-in project's tests are a script that always passes.
describeSh("from-collection: the actions check", { timeout: IMPORT_CHECK_TIMEOUT_MS }, () => {
  const ACTIONS_CHECK = path.join(PACKS, "from-collection/checks/actions.sh");
  // The check parses test files with the project's own TypeScript; the stand-in borrows this repository's.
  const REPO_TYPESCRIPT = path.join(import.meta.dirname, "..", "..", "..", "node_modules", "typescript");
  const project = (tests: string, readme: string, withTypeScript = true) => {
    if (withTypeScript) {
      mkdirSync(path.join(dir, "node_modules"), { recursive: true });
      symlinkSync(REPO_TYPESCRIPT, path.join(dir, "node_modules", "typescript"));
    }
    mkdirSync(path.join(dir, "test"), { recursive: true });
    writeFileSync(path.join(dir, "test/actions.test.ts"), tests);
    writeFileSync(path.join(dir, "README.md"), readme);
    writeFileSync(path.join(dir, "package.json"), JSON.stringify({ name: "stand-in", private: true, scripts: { build: "node -e 0", test: "node -e 0" } }));
  };
  const runActionsCheck = (base = "local") =>
    spawnSync("/bin/sh", [ACTIONS_CHECK, base], { cwd: dir, env: { ...process.env, BLUEPRINT_BASE: path.join(PACKS, base) }, encoding: "utf8" });
  const VITEST_IMPORT = 'import { it, test } from "vitest";\n';
  const TESTS = `${VITEST_IMPORT}it("books.actions.tidy: summarises", () => {}); it("books.actions.done: marks it done", () => {});`;
  const README = "## books.actions.help\n\n## authors.ingest\nPaste new authors by hand.";

  it("passes when every feature has a test naming it and every manual step is in the README", () => {
    project(TESTS, README);
    expect(runActionsCheck().status).toBe(0);
  });

  it("fails when a feature has no test naming it", () => {
    project(`${VITEST_IMPORT}it("books.actions.tidy: summarises", () => {});`, README);
    const result = runActionsCheck();
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("books.actions.done is to be built, and test/actions.test.ts has no test titled with it");
  });

  it("fails when a manual step is not in the README", () => {
    project(TESTS, "# App");
    const result = runActionsCheck();
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("authors.ingest is left to a person, and README.md has no heading naming it");
  });

  // Without its mutate, the fixture's source has nothing that must be built.
  const withoutMutate = () =>
    writeFileSync(
      path.join(dir, ".blueprint/source/collections/books/schema.json"),
      JSON.stringify({
        fields: { id: {}, title: {} },
        views: [{ id: "board" }],
        actions: [{ id: "tidy", kind: "agent" }],
        collectionActions: [{ id: "help", kind: "chat" }],
      }),
    );

  it("runs no tests when nothing is to be built", () => {
    withoutMutate();
    decide(DECISIONS.filter((entry) => entry.kind !== "mutate").map((entry) => ({ ...entry, decision: "drop" })));
    expect(runActionsCheck().status).toBe(0);
  });

  it("has nothing to do when the source had no actions", () => {
    writeFileSync(path.join(dir, ".blueprint/source/collections/books/schema.json"), JSON.stringify({ fields: { id: {} } }));
    writeFileSync(path.join(dir, ".blueprint/source/collections/authors/schema.json"), JSON.stringify({ fields: { id: {} } }));
    rmSync(path.join(dir, ACTIONS_FILE));
    const result = runActionsCheck();
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("no actions or ingests");
  });

  it("holds the record to the source even when the spec check did not run", () => {
    project(TESTS, README);
    rmSync(path.join(dir, ACTIONS_FILE));
    const result = runActionsCheck();
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(".blueprint/actions.json is missing");
  });

  it("does not count a name that is only in a comment, or a README mention outside a heading", () => {
    project(
      `${TESTS}\n// books.actions.done is covered elsewhere`.replace('it("books.actions.done: marks it done", () => {});', ""),
      "# App\nSee authors.ingest below.\n## books.actions.help",
    );
    const result = runActionsCheck();
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("books.actions.done is to be built");
    expect(result.stderr).toContain("authors.ingest is left to a person");
  });

  it.each([
    ["commented out with //", '// it("books.actions.done: marks it done", () => {});'],
    ["inside a block comment", '/* test("books.actions.done: marks it done", () => {}); */'],
    ["inside a string", "const note = 'it(\"books.actions.done: marks it done\")';"],
    ["in a describe title", 'describe("books.actions.done", () => { it("works", () => {}); });'],
    ["in a title built at run time", 'it.each([1])("books.actions.done %s", () => {}); it(`books.actions.done ${1}`, () => {});'],
    // Only the calls to the vitest imports count; everything below rejects safe-looking code on purpose (test-titles.mjs).
    ["through a helper of the same name", 'function help(test: (name: string) => void) { test("books.actions.done: via a parameter"); }'],
    ["as the thisArg of .bind on the import", 'it.bind("books.actions.done: not a title")("something else", () => {});'],
    ["through a local that shadows the import", 'const run = () => { const it = { only: (name: string) => name }; it.only("books.actions.done: shadowed"); };'],
  ])("does not count a feature named only %s", (_label, declared) => {
    project(`${VITEST_IMPORT}it("books.actions.tidy: summarises", () => {});\n${declared}`, README);
    const result = runActionsCheck();
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("books.actions.done is to be built, and test/actions.test.ts has no test titled with it");
  });

  it.each([
    ["a global it (not imported)", 'it("books.actions.tidy: summarises", () => {}); it("books.actions.done: marks it done", () => {});'],
    [
      "a file-level helper named test",
      'function test(name: string, fn?: unknown) {}\ntest("books.actions.tidy: summarises"); test("books.actions.done: marks it done");',
    ],
    [
      "test imported from somewhere else",
      'import { test } from "./helpers";\ntest("books.actions.tidy: summarises"); test("books.actions.done: marks it done");',
    ],
  ])("does not count tests declared through %s", (_label, declared) => {
    project(declared, README);
    const result = runActionsCheck();
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("books.actions.tidy is to be built");
  });

  it("counts a title through a renamed vitest import", () => {
    project(
      `import { it as spec, test as check } from "vitest";\nspec("books.actions.tidy: summarises", () => {}); check.only("books.actions.done: marks it done", () => {});`,
      README,
    );
    expect(runActionsCheck().status).toBe(0);
  });

  it("says so when the project has no TypeScript to read its tests with", () => {
    project(TESTS, README, false);
    const result = runActionsCheck();
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("the project has no typescript to read its tests with");
  });

  it("counts a title in test(), with a modifier, and a deeper heading", () => {
    project(
      `${VITEST_IMPORT}test.only("books.actions.tidy: summarises", () => {}); it.skip(\`books.actions.done: marks it done\`, () => {});`,
      "### Manual: authors.ingest\n## books.actions.help",
    );
    expect(runActionsCheck().status).toBe(0);
  });

  it("fails on an .env that .gitignore does not ignore, and passes once it does", () => {
    project(TESTS, README);
    writeFileSync(path.join(dir, ".env"), "ANTHROPIC_API_KEY=\n");
    const result = runActionsCheck();
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(".gitignore does not ignore it");
    writeFileSync(path.join(dir, ".gitignore"), "node_modules\n.env\n");
    expect(runActionsCheck().status).toBe(0);
  });

  it("reads the same test file on Cloudflare, and fails there on a .dev.vars that .gitignore does not ignore", () => {
    project(TESTS, README);
    expect(runActionsCheck("cloudflare").status).toBe(0);
    writeFileSync(path.join(dir, ".dev.vars"), "ANTHROPIC_API_KEY=\n");
    const result = runActionsCheck("cloudflare");
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(".dev.vars exists and .gitignore does not ignore it");
    writeFileSync(path.join(dir, ".gitignore"), "/.dev.vars\n");
    expect(runActionsCheck("cloudflare").status).toBe(0);
    writeFileSync(path.join(dir, "test/actions.test.ts"), `${VITEST_IMPORT}it("books.actions.tidy: summarises", () => {});`);
    expect(runActionsCheck("cloudflare").stderr).toContain("books.actions.done is to be built, and test/actions.test.ts has no test titled with it");
  });

  it("refuses a base it does not know", () => {
    project(TESTS, README);
    expect(runActionsCheck("supabase").status).toBe(2);
  });
});
