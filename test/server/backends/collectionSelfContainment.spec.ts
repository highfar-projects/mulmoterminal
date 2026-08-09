// @vitest-environment node
//
// The rules are pinned against FACTS rather than a workspace on disk, because what they encode is
// a judgement — "does this break on the other machine, and does it break the clone or merely
// annoy it" — and that judgement is what a later edit is likely to get wrong. The I/O half
// (does git ignore this directory) is exercised against real repos in a tmpdir below, since its
// whole point is that it asks git instead of guessing.
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import {
  isPortable,
  selfContainmentFactsFor,
  selfContainmentFindings,
  type SelfContainmentCode,
  type SelfContainmentFacts,
} from "../../../server/backends/collectionSelfContainment.js";
import { initCollectionsBackend } from "../../../server/backends/collections.js";
import { makeTempDir } from "../../support/tempDir";

// A collection that WOULD survive a clone: in the project, one file per record, keyed by the data.
const PORTABLE: SelfContainmentFacts = {
  source: "project",
  storageKind: "file",
  hasPrimaryKey: true,
  inGitRepo: true,
  dataDirIgnored: false,
};

const codes = (facts: Partial<SelfContainmentFacts>): SelfContainmentCode[] =>
  selfContainmentFindings({ ...PORTABLE, ...facts }).map((finding) => finding.code);

const verdict = (facts: Partial<SelfContainmentFacts>): boolean => isPortable(selfContainmentFindings({ ...PORTABLE, ...facts }));

describe("selfContainmentFindings", () => {
  it("says nothing about a collection that already travels", () => {
    expect(codes({})).toEqual([]);
    expect(verdict({})).toBe(true);
  });

  it("blocks a user-scope skill — the clone gets whatever that machine has, or nothing", () => {
    expect(codes({ source: "user" })).toContain("user-scope");
    expect(verdict({ source: "user" })).toBe(false);
  });

  it("blocks a git-ignored data directory — the schema travels and the records do not", () => {
    expect(codes({ dataDirIgnored: true })).toContain("data-ignored");
    expect(verdict({ dataDirIgnored: true })).toBe(false);
  });

  // UNKNOWN IS NOT CLEAN. `null` means the question could not be answered (no repo, no git), and
  // reporting nothing is right — but it must not be reached by treating null as `false`, which is
  // the shape that would also clear a genuinely ignored directory the day git fails to run.
  it("says nothing when the ignore state could not be established", () => {
    expect(codes({ dataDirIgnored: null })).not.toContain("data-ignored");
  });

  it("blocks a sqlite store in a repo, because git cannot merge one file", () => {
    expect(codes({ storageKind: "sqlite" })).toContain("sqlite-store");
    expect(verdict({ storageKind: "sqlite" })).toBe(false);
  });

  // Outside a repo there is nothing to merge, so the unmergeable-binary argument does not apply.
  it("does not raise sqlite outside a repo", () => {
    expect(codes({ storageKind: "sqlite", inGitRepo: false, dataDirIgnored: null })).not.toContain("sqlite-store");
  });

  it("warns about a csv/DuckDB collection without blocking it — the file itself travels", () => {
    expect(codes({ storageKind: "csv" })).toContain("csv-runtime");
    expect(verdict({ storageKind: "csv" })).toBe(true);
  });

  it("warns about a missing primaryKey in a repo — two machines can mint one id", () => {
    expect(codes({ hasPrimaryKey: false })).toContain("no-primary-key");
    expect(verdict({ hasPrimaryKey: false })).toBe(true);
  });

  it("does not nag about the primaryKey outside a repo, where no second machine exists yet", () => {
    expect(codes({ hasPrimaryKey: false, inGitRepo: false, dataDirIgnored: null })).not.toContain("no-primary-key");
  });

  it("reports a non-repo as info, and says the git checks did not run", () => {
    const findings = selfContainmentFindings({ ...PORTABLE, inGitRepo: false, dataDirIgnored: null });
    expect(findings.map((f) => f.code)).toEqual(["not-a-repo"]);
    expect(findings[0]?.severity).toBe("info");
    expect(isPortable(findings)).toBe(true);
  });

  it("reports every applicable leak rather than the first one", () => {
    expect(codes({ source: "user", storageKind: "sqlite", hasPrimaryKey: false, dataDirIgnored: true })).toEqual([
      "user-scope",
      "data-ignored",
      "sqlite-store",
      "no-primary-key",
    ]);
  });

  it("names what breaks on the other machine, not just the rule", () => {
    for (const finding of selfContainmentFindings({ source: "user", storageKind: "csv", hasPrimaryKey: false, inGitRepo: true, dataDirIgnored: true })) {
      expect(finding.message.length).toBeGreaterThan(40);
    }
  });
});

// The half that cannot be faked: whether git ignores the data directory. A hand-rolled
// .gitignore parser would clear a collection that IS ignored — by a rule in a parent directory,
// in .git/info/exclude, or by a pattern it did not implement — so the check shells out, and this
// is what pins that it reads the answer correctly.
// A slug nothing real will own: user scope is `~/.claude/skills`, i.e. the REAL home directory,
// so a common name here could be answered by a collection the machine happens to have.
const SLUG = "mt-self-containment-fixture";

describe("selfContainmentFactsFor against a real repo", () => {
  let root = "";

  const git = (...args: string[]): void => {
    // eslint-disable-next-line sonarjs/no-os-command-from-path -- 'git' from PATH in a test; argv only, no shell
    execFileSync("git", args, { cwd: root, stdio: "ignore" });
  };

  /** The loaded facts, or a failure that names what went wrong — the fixture not loading is a
   *  broken test, not a finding, and it should not read as one. */
  const factsFor = async (slug: string): Promise<SelfContainmentFacts> => {
    const facts = await selfContainmentFactsFor(slug, { workspaceRoot: root });
    if (!facts) throw new Error(`fixture collection '${slug}' did not load from ${root}`);
    return facts;
  };

  // The shape the engine actually accepts (see collectionStaging.spec.ts) — a fields MAP, not a
  // list, and the slug comes from the directory name rather than the file.
  const writeCollection = (slug: string, schema: Record<string, unknown> = {}): void => {
    const skillDir = path.join(root, ".claude", "skills", slug);
    fs.mkdirSync(skillDir, { recursive: true });
    const body = {
      title: "Fixture",
      icon: "star",
      dataPath: `data/collections/${slug}/items`,
      primaryKey: "id",
      fields: { id: { type: "string", label: "ID", primary: true, required: true } },
      ...schema,
    };
    fs.writeFileSync(path.join(skillDir, "schema.json"), JSON.stringify(body));
  };

  // ONCE per process: the host slot refuses a second, different binding. Which workspace it names
  // does not matter here — the engine is in explicit-root mode, so every call below carries its
  // own root and the binding only supplies the paths layout (where a project's skills live).
  beforeAll(() => {
    initCollectionsBackend({ workspace: makeTempDir("mt-self-contain-host-") });
  });

  beforeEach(() => {
    root = makeTempDir("mt-self-contain-");
  });

  it("sees a data directory excluded by .gitignore", async () => {
    git("init");
    writeCollection(SLUG);
    fs.writeFileSync(path.join(root, ".gitignore"), "data/\n");

    const facts = await factsFor(SLUG);
    expect(facts.inGitRepo).toBe(true);
    expect(facts.dataDirIgnored).toBe(true);
    expect(selfContainmentFindings(facts).map((f) => f.code)).toContain("data-ignored");
  });

  it("clears the same collection once the ignore line is gone", async () => {
    git("init");
    writeCollection(SLUG);
    fs.writeFileSync(path.join(root, ".gitignore"), "node_modules/\n");

    const facts = await factsFor(SLUG);
    expect(facts.dataDirIgnored).toBe(false);
    expect(selfContainmentFindings(facts)).toEqual([]);
  });

  it("reports a directory that is not a repo as one, and asks git nothing further", async () => {
    writeCollection(SLUG);

    const facts = await factsFor(SLUG);
    expect(facts.inGitRepo).toBe(false);
    expect(facts.dataDirIgnored).toBeNull();
  });

  // The rule that bites in practice is not "ignore the folder" — it is a pattern that excludes the
  // FILES while leaving the folder perfectly committable. check-ignore answers about the paths it
  // is given and nothing below them, so asking only about the directory read as clean while every
  // record in it was ignored.
  it("sees a rule that ignores the record files inside an unignored data directory", async () => {
    git("init");
    writeCollection(SLUG);
    const items = path.join(root, "data", "collections", SLUG, "items");
    fs.mkdirSync(items, { recursive: true });
    fs.writeFileSync(path.join(items, "one.json"), JSON.stringify({ id: "one" }));
    fs.writeFileSync(path.join(root, ".gitignore"), "data/**/*.json\n");

    const facts = await factsFor(SLUG);
    expect(facts.dataDirIgnored).toBe(true);
    expect(isPortable(selfContainmentFindings(facts))).toBe(false);
  });

  // An EMPTY collection is exactly when this matters: nothing is committed yet, so there is no
  // missing file to notice. A probe path stands in for the record that will be written.
  it("sees the same rule before any record exists", async () => {
    git("init");
    writeCollection(SLUG);
    fs.writeFileSync(path.join(root, ".gitignore"), "*.json\n");

    expect((await factsFor(SLUG)).dataDirIgnored).toBe(true);
  });

  // The probe must not invent a problem: an unignored empty collection stays portable.
  it("does not report an empty collection whose records nothing excludes", async () => {
    git("init");
    writeCollection(SLUG);
    fs.writeFileSync(path.join(root, ".gitignore"), "node_modules/\n");

    const facts = await factsFor(SLUG);
    expect(facts.dataDirIgnored).toBe(false);
    expect(selfContainmentFindings(facts)).toEqual([]);
  });

  // The records of a `dataSource` collection are NOT in the data directory — they are the rows of
  // the external file. Asking about the directory answers about a folder they were never in, so a
  // `*.csv` ignore line reported nothing and left `portable: true` on a clone with no records.
  it("asks about the external data file for a csv collection, not the data directory", async () => {
    git("init");
    writeCollection(SLUG, { dataPath: undefined, dataSource: { type: "csv", path: `data/${SLUG}/rows.csv` } });
    fs.mkdirSync(path.join(root, "data", SLUG), { recursive: true });
    fs.writeFileSync(path.join(root, "data", SLUG, "rows.csv"), "id\n1\n");
    // Ignores the FILE while leaving the conventional data directory perfectly committable.
    fs.writeFileSync(path.join(root, ".gitignore"), "*.csv\n");

    const facts = await factsFor(SLUG);
    expect(facts.storageKind).toBe("csv");
    expect(facts.dataDirIgnored).toBe(true);
    const findings = selfContainmentFindings(facts);
    expect(findings.map((f) => f.code)).toContain("data-ignored");
    expect(isPortable(findings)).toBe(false);
  });

  it("answers null for a slug this project does not have", async () => {
    expect(await selfContainmentFactsFor("nope", { workspaceRoot: root })).toBeNull();
  });
});
