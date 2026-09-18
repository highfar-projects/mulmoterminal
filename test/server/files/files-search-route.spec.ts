// @vitest-environment node
//
// GET /api/files/browse/search against REAL directories and a real `git grep` (#2140).
//
// The subprocess is not mocked, deliberately: every decision worth testing here is about what git
// actually does — which files `--untracked` reaches, whether `.gitignore` is applied, what happens
// outside a repository, and above all whether an edited-but-unstaged file is searched as it is on
// disk. A mock would assert what I believed git does, which is the thing that was wrong before the
// probes that produced this feature.
import { describe, it, expect, beforeAll } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import express from "express";
import { routeCall } from "../../helpers/routeCall";
import { makeTempDir } from "../../support/tempDir.js";
import { mountFilesBrowseRoutes } from "../../../server/files/files-browse";
import { MAX_MATCHES_PER_FILE, MAX_SNIPPET_CHARS } from "../../../common/fileSearch";

// Every case here spawns REAL git — twice per search, since the route asks which mode the
// directory calls for before running one. The suite default is 15s, which a case doing several
// searches loses on a loaded machine: measured, this file takes minutes at a load average above 20.
// A longer budget rather than fewer subprocesses, because the subprocesses ARE the test — a mock
// here would assert what I believe git does, which is the thing that was wrong before the probes
// that produced this feature.
const REAL_GIT_TIMEOUT_MS = 120_000;

const app = express();
mountFilesBrowseRoutes(app, { defaultCwd: process.cwd(), backupRoot: makeTempDir("mt-search-backup-") });
const call = routeCall(app);

/** `git` with no user config, so a runner without one can still commit. */
const runGit = (cwd: string, args: string[]): void => {
  // eslint-disable-next-line sonarjs/no-os-command-from-path -- 'git' from PATH in a test; argv only, no shell
  execFileSync("git", ["-c", "user.email=t@example.com", "-c", "user.name=t", ...args], { cwd, stdio: "ignore" });
};

interface SearchBody {
  matches?: { path: string; line: number; text: string; clipped: boolean }[];
  truncated?: boolean;
  source?: string;
  error?: string;
}

const search = async (cwd: string, query: string, extra: Record<string, string> = {}): Promise<SearchBody> => {
  const res = await call(`/api/files/browse/search?${new URLSearchParams({ cwd, q: query, ...extra })}`);
  expect(res.status).toBe(200);
  return res.body as SearchBody;
};

const pathsIn = (body: SearchBody): string[] => [...new Set((body.matches ?? []).map((match) => match.path))].sort();

let repo = "";
let plain = "";

beforeAll(() => {
  repo = makeTempDir("mt-search-repo-");
  runGit(repo, ["init"]);
  mkdirSync(path.join(repo, "src"));
  writeFileSync(path.join(repo, "src", "tracked.ts"), "const needle = 1;\nsecond line\n");
  writeFileSync(path.join(repo, ".gitignore"), "ignored.log\nbuilt/\n");
  runGit(repo, ["add", "src/tracked.ts", ".gitignore"]);
  runGit(repo, ["commit", "-m", "init"]);
  // Written AFTER the commit: untracked and not ignored, exactly like a file the agent in this
  // directory just created.
  writeFileSync(path.join(repo, "src", "fresh.ts"), "a needle appears\n");
  writeFileSync(path.join(repo, "ignored.log"), "needle in an ignored file\n");
  mkdirSync(path.join(repo, "built"));
  writeFileSync(path.join(repo, "built", "out.js"), "needle in an ignored directory\n");

  plain = makeTempDir("mt-search-plain-");
  writeFileSync(path.join(plain, "a.txt"), "a needle here\n");
});

describe("GET /api/files/browse/search — in a repository", () => {
  it("finds a tracked file, with the line and the text", async () => {
    const body = await search(repo, "needle");
    expect(body.source).toBe("git");
    expect(body.matches).toContainEqual({ path: "src/tracked.ts", line: 1, text: "const needle = 1;", clipped: false });
  });

  // `--untracked`, which is what makes the feature usable next to a working agent: a file created
  // seconds ago is not in the index and is still the file you are looking for.
  it("finds an untracked file the agent just wrote", async () => {
    expect(pathsIn(await search(repo, "needle"))).toContain("src/fresh.ts");
  });

  // The authority this leans on rather than re-implementing: a nested ignore file, the global
  // excludes and negation patterns all decide this, so it is asked of git.
  it("skips a .gitignored file and a .gitignored directory", async () => {
    const paths = pathsIn(await search(repo, "needle"));
    expect(paths).not.toContain("ignored.log");
    expect(paths).not.toContain("built/out.js");
  });

  // THE TRAP, pinned. `--cached` searches the index, so this file would answer from whenever it was
  // last staged. This assertion is what goes red if someone adds that flag later for speed.
  it("searches the WORKING TREE, so an edited unstaged file is found as it is on disk", async () => {
    const edited = makeTempDir("mt-search-edit-");
    runGit(edited, ["init"]);
    writeFileSync(path.join(edited, "a.ts"), "committedword\n");
    runGit(edited, ["add", "a.ts"]);
    runGit(edited, ["commit", "-m", "init"]);
    // Saved but NOT staged — the state a file is in the moment the editor writes it.
    writeFileSync(path.join(edited, "a.ts"), "unstagedword\n");

    expect(pathsIn(await search(edited, "unstagedword"))).toEqual(["a.ts"]);
    // And the other direction: a word that is only in the index now must NOT be reported, or the
    // search would point at text the file no longer contains.
    expect(await search(edited, "committedword")).toMatchObject({ matches: [] });
  });

  it("answers an unmatched query with no matches rather than an error", async () => {
    const body = await search(repo, "nosuchwordanywhere");
    expect(body.matches).toEqual([]);
    expect(body.truncated).toBe(false);
    // `git grep` exits 1 here. Reported as a repository answer, NOT retried without .gitignore —
    // a retry would answer this clean "nothing found" with node_modules.
    expect(body.source).toBe("git");
  });
});

describe("GET /api/files/browse/search — outside a repository", () => {
  it("still searches, and says .gitignore was not applied", async () => {
    const body = await search(plain, "needle");
    expect(body.source).toBe("no-index");
    expect(pathsIn(body)).toEqual(["a.txt"]);
  });
});

describe("GET /api/files/browse/search — the query itself", () => {
  it("refuses an empty query instead of matching every line", async () => {
    const res = await call(`/api/files/browse/search?${new URLSearchParams({ cwd: repo, q: "" })}`);
    expect(res.status).toBe(400);
  });

  // The reason the pattern goes through `-e`: without it this is read as a flag and the search
  // either errors or means something else entirely.
  it("treats a query that looks like a flag as a query", async () => {
    const dashes = makeTempDir("mt-search-dash-");
    writeFileSync(path.join(dashes, "a.txt"), "passing --untracked to it\n");
    expect(pathsIn(await search(dashes, "--untracked"))).toEqual(["a.txt"]);
  });

  // The same query, two meanings, asserted by WHICH LINE each one finds rather than by a count —
  // a count can agree by accident, and here the two modes match different lines of one file.
  it(
    "matches literally by default and as a regex when asked",
    async () => {
      const dir = makeTempDir("mt-search-regex-");
      writeFileSync(path.join(dir, "a.txt"), "call foo(bar) here\nfoobar plain\n");
      // Literal: the parens are characters. Someone searching for their own call site means this.
      expect((await search(dir, "foo(bar)")).matches).toEqual([{ path: "a.txt", line: 1, text: "call foo(bar) here", clipped: false }]);
      // Regex: the same string is a group, so it matches the concatenation on the other line.
      expect((await search(dir, "foo(bar)", { regex: "1" })).matches).toEqual([{ path: "a.txt", line: 2, text: "foobar plain", clipped: false }]);
    },
    REAL_GIT_TIMEOUT_MS,
  );

  it(
    "is smart about case, and takes an explicit override",
    async () => {
      const dir = makeTempDir("mt-search-case-");
      writeFileSync(path.join(dir, "a.txt"), "Session and session\n");
      expect((await search(dir, "session")).matches).toHaveLength(1); // one LINE, matched either way
      expect((await search(dir, "Session")).matches).toHaveLength(1);
      // A lower-case query with case forced on must miss a capitalised-only word.
      const caps = makeTempDir("mt-search-caps-");
      writeFileSync(path.join(caps, "a.txt"), "Session only\n");
      expect((await search(caps, "session")).matches).toHaveLength(1);
      expect((await search(caps, "session", { case: "1" })).matches).toEqual([]);
    },
    REAL_GIT_TIMEOUT_MS,
  );
});

describe("GET /api/files/browse/search — a search that could not run", () => {
  // THE TRAP CODEX FOUND, pinned. `git grep` exits 128 for `fatal: not a git repository` AND for
  // `fatal: -e option, 'foo(': parentheses not balanced`, and the stderr separating them is
  // discarded by design. Reading 128 as "not a repository" made an invalid pattern retry in
  // --no-index mode, fail again, and come back as a SUCCESSFUL empty search — telling the reader
  // two untrue things at once: that nothing matched, and that .gitignore was not applied.
  it("refuses an invalid regex instead of reporting an empty successful search", async () => {
    const res = await call(`/api/files/browse/search?${new URLSearchParams({ cwd: repo, q: "foo(", regex: "1" })}`);
    expect(res.status).toBe(422);
    expect(String(res.body.error)).toContain("regular expression");
    // The half that made it dangerous: it must not look like an answer.
    expect(res.body.matches).toBeUndefined();
    expect(res.body.source).toBeUndefined();
  });

  // The control for the case above. The same characters as a LITERAL query are a perfectly good
  // search, so the refusal has to be about the pattern being compiled, not about the text.
  it("searches the same query happily when it is not a regex", async () => {
    const body = await search(repo, "foo(");
    expect(body.source).toBe("git");
    expect(body.matches).toEqual([]); // nothing in the fixture contains it — but it ANSWERED
  });

  // And the other direction: a directory that is not a repository is still SEARCHED, in the mode
  // the probe names for it. Nothing retries here — the mode is chosen before any search runs — and
  // this is the case a stricter refusal rule could have broken.
  it("searches a plain directory in no-index mode", async () => {
    expect((await search(plain, "needle")).source).toBe("no-index");
  });
});

describe("GET /api/files/browse/search — what it leaves out, and says it did", () => {
  it("caps one file's matches and reports the truncation", async () => {
    const dir = makeTempDir("mt-search-cap-");
    writeFileSync(path.join(dir, "many.txt"), Array.from({ length: MAX_MATCHES_PER_FILE + 10 }, () => "needle").join("\n"));
    const body = await search(dir, "needle");
    expect(body.matches).toHaveLength(MAX_MATCHES_PER_FILE);
    expect(body.truncated).toBe(true);
  });

  it("cuts a very long line and marks it", async () => {
    const dir = makeTempDir("mt-search-long-");
    writeFileSync(path.join(dir, "min.js"), `${"x".repeat(MAX_SNIPPET_CHARS + 100)}needle\n`);
    const body = await search(dir, "needle");
    expect(body.matches?.[0]?.text).toHaveLength(MAX_SNIPPET_CHARS);
    expect(body.matches?.[0]?.clipped).toBe(true);
  });

  // A binary is not a line to open, and without -I git prints "Binary file … matches" instead.
  it("does not offer a binary file", async () => {
    const dir = makeTempDir("mt-search-bin-");
    writeFileSync(path.join(dir, "blob.dat"), Buffer.from([0x6e, 0x65, 0x65, 0x64, 0x6c, 0x65, 0x00, 0x01]));
    writeFileSync(path.join(dir, "a.txt"), "needle\n");
    expect(pathsIn(await search(dir, "needle"))).toEqual(["a.txt"]);
  });
});
