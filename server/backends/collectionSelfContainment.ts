// "Would this collection survive a clone?"
//
// A collection created in a git-managed project, pushed and pulled on another machine, must just
// work — nothing it needs may live outside the project directory. Most of that already holds by
// construction: `resolveDataDir` refuses absolute paths, `..` segments and symlinks escaping the
// root, so a schema literally cannot point at a machine-specific location, and the on-disk layout
// (`.claude/skills/<slug>/` + `data/collections/<slug>/items/`) travels whole.
//
// What leaks is enumerable, and every leak is statically detectable — which is the whole reason
// this file is cheap enough to be worth having. See plans/feat-collections-project-root.md §11.
//
// The point is the FAILURE MODE, not tidiness: each of these breaks on the OTHER machine, days
// later, in a way that reads as something else. A git-ignored data directory opens as an empty
// collection, not as "not committed". A user-scope skill silently resolves to whatever that
// machine happens to have. Nothing warns, because from here everything works.
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { storageKindFor } from "@mulmoclaude/core/collection";
import { loadCollection } from "@mulmoclaude/core/collection/server";
import type { Express, Request, Response } from "express";
import { errorStatus, resolveProjectRoot, type ProjectScope } from "../infra/project-root.js";
import { isRecord } from "../../common/isRecord.js";

const run = promisify(execFile);

/** Why a collection would not survive a clone. Stable strings — a client branches on these, and
 *  the prose is free to be rewritten. */
export type SelfContainmentCode =
  /** The skill lives in `~/.claude/skills`, i.e. on this machine and not in the repo. */
  | "user-scope"
  /** Records are one SQLite file: git cannot merge it. */
  | "sqlite-store"
  /** Records are rows of a CSV read through DuckDB — a runtime the clone must also have. */
  | "csv-runtime"
  /** The data directory is git-ignored: the schema travels, the records do not. */
  | "data-ignored"
  /** No `primaryKey`, so ids are 4 random bytes and two machines can mint the same one. */
  | "no-primary-key"
  /** The project is not a git repo, so there is nothing to clone and most checks do not apply. */
  | "not-a-repo";

export type SelfContainmentSeverity = "blocker" | "warning" | "info";

export interface SelfContainmentFinding {
  code: SelfContainmentCode;
  severity: SelfContainmentSeverity;
  /** What breaks on the other machine, in the terms the person will see it. */
  message: string;
}

/** Everything the verdict depends on, separated from how it is discovered — so the rules can be
 *  exercised without a git repo and a workspace on disk, and so each rule reads as one line. */
export interface SelfContainmentFacts {
  source: "user" | "project" | "feed";
  storageKind: "file" | "csv" | "sqlite";
  hasPrimaryKey: boolean;
  inGitRepo: boolean;
  /** Whether git ignores the path the RECORDS actually live at — the external `dataSource` file
   *  or the `storage` backend file when the schema declares one, else the data directory
   *  (`recordPathOf`).
   *
   *  Null when it could not be established — not a repo, or git is not on PATH. Null is NOT
   *  "fine": it is "unknown", and the check says nothing rather than clearing it. */
  dataDirIgnored: boolean | null;
}

export interface SelfContainmentReport {
  slug: string;
  /** True when nothing BLOCKS the clone. Warnings can still be present. */
  portable: boolean;
  findings: SelfContainmentFinding[];
}

/** The rules, in the order someone should act on them. Pure. */
export function selfContainmentFindings(facts: SelfContainmentFacts): SelfContainmentFinding[] {
  const findings: SelfContainmentFinding[] = [];

  if (facts.source === "user") {
    findings.push({
      code: "user-scope",
      severity: "blocker",
      message:
        "This collection is defined in ~/.claude/skills, which is on this machine and not in the project. A clone gets whatever that machine happens to have there, or nothing. Move the skill into the project's .claude/skills to share it.",
    });
  }

  if (facts.dataDirIgnored === true) {
    findings.push({
      code: "data-ignored",
      severity: "blocker",
      message:
        "The data directory is excluded by .gitignore, so the schema is committed and every record is not. A clone opens the collection and sees zero rows, which reads as an empty collection rather than as missing data.",
    });
  }

  if (facts.storageKind === "sqlite" && facts.inGitRepo) {
    findings.push({
      code: "sqlite-store",
      severity: "blocker",
      message:
        "Records are stored in one SQLite file. Git cannot merge a binary file, so two machines editing this collection offline produce a conflict nobody can resolve — where the default one-file-per-record storage merges cleanly.",
    });
  }

  if (facts.storageKind === "csv") {
    findings.push({
      code: "csv-runtime",
      severity: "warning",
      message: "Records are rows of a CSV, queried through DuckDB. The file itself travels with the project, but the clone needs that runtime too.",
    });
  }

  if (!facts.hasPrimaryKey && facts.inGitRepo) {
    findings.push({
      code: "no-primary-key",
      severity: "warning",
      message:
        "No primaryKey is declared, so record ids are 4 random bytes. Two machines creating records offline can mint the same id; declaring a primaryKey derives the id from the record instead, which turns a silent collision into an obvious git conflict.",
    });
  }

  if (!facts.inGitRepo) {
    findings.push({
      code: "not-a-repo",
      severity: "info",
      message: "This project is not a git repository, so there is nothing to clone yet. The checks that depend on git were not run.",
    });
  }

  return findings;
}

/** A blocker is what stops the clone working; warnings and info do not. */
export function isPortable(findings: readonly SelfContainmentFinding[]): boolean {
  return !findings.some((finding) => finding.severity === "blocker");
}

/** Whether `root` is inside a git work tree. False for "not a repo" AND for "git is not
 *  installed" — from this check's point of view the two are the same answer: the git-dependent
 *  rules cannot run. */
async function inGitRepo(root: string): Promise<boolean> {
  try {
    const { stdout } = await run("git", ["rev-parse", "--is-inside-work-tree"], { cwd: root, timeout: 5_000 });
    return stdout.trim() === "true";
  } catch {
    return false;
  }
}

/** Whether git would ignore `target`. Asks GIT rather than parsing `.gitignore` ourselves: the
 *  rule that matters may come from a parent directory, from `.git/info/exclude`, or from the
 *  user's global ignore file, and a hand-rolled parser would clear a collection that is in fact
 *  ignored. Works on a path that does not exist yet, which the data dir often does not.
 *
 *  `--no-index` REPORTS THE RULE, not the current tracking state. Without it, a directory that is
 *  already tracked reads as "not ignored" even with a matching rule — true for the files already
 *  committed, and misleading about every record written from now on, which is the failure this
 *  check exists to catch.
 *
 *  `check-ignore` exits 0 for ignored, 1 for not ignored, and >1 for an error — and execFile
 *  rejects on any non-zero, so the exit code is read off the error rather than the resolution. */
async function isGitIgnored(root: string, target: string): Promise<boolean | null> {
  try {
    await run("git", ["check-ignore", "-q", "--no-index", target], { cwd: root, timeout: 5_000 });
    return true;
  } catch (err) {
    if (isRecord(err) && err.code === 1) return false;
    // Anything else (git missing, a broken repo) is UNKNOWN, not "not ignored".
    return null;
  }
}

/** The path whose ignore state decides whether the RECORDS travel — which is not always the data
 *  directory. A `dataSource` collection's rows live in the external file, and a `storage`
 *  collection's rows live in its backend file; `dataDir` is then only the conventional per-slug
 *  directory, and asking about it answers about a folder the records were never in. A `*.csv` or
 *  `*.db` ignore line would have gone unreported, `portable: true`, with the clone containing no
 *  records at all — the exact failure this rule exists to catch, aimed one directory to the left. */
function recordPathOf(collection: { dataDir: string; dataSourceFile?: string; storageFile?: string }): string {
  return collection.dataSourceFile ?? collection.storageFile ?? collection.dataDir;
}

/** Gather the facts for one collection. Exported so a caller can run the rules over facts it
 *  already holds. */
export async function selfContainmentFactsFor(slug: string, scope: ProjectScope): Promise<SelfContainmentFacts | null> {
  const collection = await loadCollection(slug, scope);
  if (!collection) return null;
  const git = await inGitRepo(scope.workspaceRoot);
  return {
    source: collection.source,
    storageKind: storageKindFor(collection.schema),
    hasPrimaryKey: typeof collection.schema.primaryKey === "string" && collection.schema.primaryKey.length > 0,
    inGitRepo: git,
    // Only meaningful inside a repo; outside one, `check-ignore` answers about a repo that is
    // not the one this collection would be cloned from.
    dataDirIgnored: git ? await isGitIgnored(scope.workspaceRoot, path.resolve(recordPathOf(collection))) : null,
  };
}

/** The route handler, HERE rather than in collections.ts: that file is already at its line
 *  budget, and a handler this thin next to the rules it reports keeps both readable.
 *
 *  A GET rather than something computed at creation time — the answer changes without the
 *  collection changing (a `.gitignore` line lands, `git init` runs, the skill is moved into the
 *  project), so it has to be asked when someone wants to know.
 *
 *  MulmoTerminal's own route: MulmoClaude has no counterpart to match, being single-root. */
async function respondSelfContainment(req: Request<{ slug: string }>, res: Response): Promise<void> {
  const report = await checkCollectionSelfContainment(req.params.slug, resolveProjectRoot(req));
  if (!report) {
    res.status(404).json({ error: `collection '${req.params.slug}' not found` });
    return;
  }
  res.json(report);
}

/** Mounts its own route, beside the other collection mounts in app-routes.ts, rather than being
 *  registered from collections.ts — that file sits at its line budget, and a feature that owns
 *  one route has no reason to spend a line there. A spec that exercises this route has to mount
 *  it too (collectionsProjectScope.spec.ts). */
export function mountSelfContainmentRoutes(app: Express): void {
  app.get("/api/collections/:slug/self-containment", (req, res) => {
    // The same guard the collection routes use: a request naming a project this server cannot
    // serve is a CLIENT error, and answering 500 would read as "the server broke" for a typo.
    void (async () => {
      try {
        await respondSelfContainment(req, res);
      } catch (err) {
        res.status(errorStatus(err)).json({ error: err instanceof Error ? err.message : String(err) });
      }
    })();
  });
}

/** The full check for one collection, or null when the slug names none. */
export async function checkCollectionSelfContainment(slug: string, scope: ProjectScope): Promise<SelfContainmentReport | null> {
  const facts = await selfContainmentFactsFor(slug, scope);
  if (!facts) return null;
  const findings = selfContainmentFindings(facts);
  return { slug, portable: isPortable(findings), findings };
}
