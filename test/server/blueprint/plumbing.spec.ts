// @vitest-environment node
// The executor's real edges: the run store on disk, the check runner through /bin/sh, and the
// ask command an agent pastes — sent at a real HTTP server, with a question that would break
// naive quoting.
import { describe, it, expect, afterEach } from "vitest";
import { execFile } from "node:child_process";
import { createServer, type Server } from "node:http";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createRunStore } from "../../../server/blueprint/runStore";
import { runCheck } from "../../../server/blueprint/checkRunner";
import { askCommand } from "../../../server/blueprint/wiring";
import { claudeTrusts, gitRootOf, gitdirOf, isTrustedByClaude, mainRootOf } from "../../../server/blueprint/trust";
import { initialState } from "../../../common/blueprint/state";
import type { BlueprintRun } from "../../../common/blueprint/run";

const dirs: string[] = [];
const tempDir = async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "blueprint-"));
  dirs.push(dir);
  return dir;
};
afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

const steps = [{ id: "a", title: "A", description: "", skill: "skills/a", check: "true", gates: [], reads: [], origin: "base" as const }];
const run = (id: string): BlueprintRun => ({
  id,
  projectDir: "/p",
  basePackDir: "/b",
  usecasePackDir: "/u",
  steps,
  failedChecks: {},
  failureOutputs: {},
  specChat: [],
  revisionSessionId: null,
  activeSessionId: null,
  sessions: [],
  createdAtMs: 1,
  archivedAtMs: null,
  language: null,
  answers: {},
});

describe("runStore", () => {
  it("round-trips a run and its state", async () => {
    const store = createRunStore(await tempDir());
    await store.save(run("run-00000001"), initialState(steps));
    expect(await store.load("run-00000001")).toEqual({ run: run("run-00000001"), state: initialState(steps) });
    expect(await store.list()).toEqual(["run-00000001"]);
  });

  it("answers null for a run that does not exist or an id that could escape the directory", async () => {
    const store = createRunStore(await tempDir());
    expect(await store.load("run-00000404")).toBeNull();
    expect(await store.load("../../etc")).toBeNull();
  });

  it("names the run when its files are corrupt", async () => {
    const root = await tempDir();
    const store = createRunStore(root);
    await store.save(run("run-00000001"), initialState(steps));
    await writeFile(path.join(root, "run-00000001", "build.json"), "{ not json");
    await expect(store.load("run-00000001")).rejects.toThrow("run-00000001");
  });
});

describe.skipIf(process.platform === "win32")("runCheck", () => {
  it("passes on exit 0 and hands the check both pack directories", async () => {
    const cwd = await tempDir();
    const result = await runCheck({ command: 'echo "$BLUEPRINT_BASE|$BLUEPRINT_USECASE|$(pwd)"', cwd, basePackDir: "/packs/b", usecasePackDir: "/packs/u" });
    expect(result.ok).toBe(true);
    expect(result.output).toContain("/packs/b|/packs/u|");
  });

  it("ends the whole process group on a timeout, not only the shell", async () => {
    const started = Date.now();
    const result = await runCheck({ command: "sleep 30 & sleep 30", cwd: await tempDir(), basePackDir: "/b", usecasePackDir: "/u" }, 300);
    expect(result.ok).toBe(false);
    expect(result.output).toContain("timed out");
    expect(Date.now() - started).toBeLessThan(10_000);
  });

  it("does not wait on a descendant that left the process group and holds the pipes", async () => {
    const started = Date.now();
    const escape = 'node -e \'require("child_process").spawn("sleep", ["30"], { detached: true, stdio: "inherit" }).unref()\'; echo done';
    const result = await runCheck({ command: escape, cwd: await tempDir(), basePackDir: "/b", usecasePackDir: "/u" }, 20_000);
    expect(result).toEqual({ ok: true, output: "done\n" });
    expect(Date.now() - started).toBeLessThan(10_000);
  });

  it("does not wait on a descendant the check left running", async () => {
    const started = Date.now();
    const result = await runCheck({ command: "(sleep 30 &); echo done", cwd: await tempDir(), basePackDir: "/b", usecasePackDir: "/u" }, 20_000);
    expect(result).toEqual({ ok: true, output: "done\n" });
    expect(Date.now() - started).toBeLessThan(10_000);
  });

  it("runs checks with colour off, so a number piped between commands stays a number", async () => {
    process.env.FORCE_COLOR = "3";
    try {
      const result = await runCheck({
        command: 'echo "force=${FORCE_COLOR:-unset} no=${NO_COLOR:-unset}"',
        cwd: await tempDir(),
        basePackDir: "/b",
        usecasePackDir: "/u",
      });
      expect(result.output).toContain("force=unset no=1");
    } finally {
      delete process.env.FORCE_COLOR;
    }
  });

  it("fails on a non-zero exit and keeps what the check printed", async () => {
    const result = await runCheck({ command: "echo missing thing >&2; exit 3", cwd: await tempDir(), basePackDir: "/b", usecasePackDir: "/u" });
    expect(result.ok).toBe(false);
    expect(result.output).toContain("missing thing");
  });
});

describe.skipIf(process.platform === "win32")("askCommand", () => {
  let server: Server | undefined;
  afterEach(() => server?.close());

  it.each([
    [34999, "run 1", "a"],
    [34999, "run-00000001", "a;rm"],
    ["1; rm", "run-00000001", "a"],
  ])("refuses to build a command from unsafe arguments (%s, %s, %s)", (port, runId, stepId) => {
    expect(() => askCommand(port, runId, stepId, "sess-1")).toThrow("unsafe");
  });

  it("fails, with the server's reason, when the question is refused", async () => {
    server = createServer((_req, res) => {
      res.statusCode = 409;
      res.end(JSON.stringify({ error: "this session is not the one working on the step" }));
    });
    await new Promise<void>((resolve) => server?.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    const port = typeof address === "object" && address ? address.port : 0;
    const outcome = await new Promise<{ failed: boolean; stdout: string }>((resolve) =>
      execFile("/bin/sh", ["-c", `QUESTION='q' ${askCommand(port, "run-00000001", "projects", "sess-1")}`], (err, stdout) =>
        resolve({ failed: err !== null, stdout }),
      ),
    );
    expect(outcome.failed).toBe(true);
    expect(outcome.stdout).toContain("not the one working");
  });

  it("delivers the question intact, quotes and all, to the run's ask route", async () => {
    const received: { url: string; body: unknown }[] = [];
    server = createServer((req, res) => {
      let body = "";
      req.on("data", (chunk) => (body += chunk));
      req.on("end", () => {
        received.push({ url: req.url ?? "", body: JSON.parse(body) });
        res.end("{}");
      });
    });
    await new Promise<void>((resolve) => server?.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    const port = typeof address === "object" && address ? address.port : 0;
    const question = `Use "asia-northeast1" or it's 'us-central1'? $HOME \`x\``;
    await new Promise<void>((resolve, reject) =>
      execFile("/bin/sh", ["-c", askCommand(port, "run-00000001", "projects", "sess-1")], { env: { ...process.env, QUESTION: question } }, (err) =>
        err ? reject(err) : resolve(),
      ),
    );
    // Exactly as the step prompt tells the agent to type it: the variable as a PREFIX, not in the
    // environment — the form a real run broke on.
    const withoutQuestion = Object.fromEntries(Object.entries(process.env).filter(([key]) => key !== "QUESTION"));
    await new Promise<void>((resolve, reject) =>
      execFile(
        "/bin/sh",
        ["-c", `QUESTION='Which region, Tokyo?' ${askCommand(port, "run-00000001", "projects", "sess-1")}`],
        { env: withoutQuestion },
        (err) => (err ? reject(err) : resolve()),
      ),
    );
    expect(received).toEqual([
      { url: "/api/blueprints/runs/run-00000001/ask", body: { stepId: "projects", sessionId: "sess-1", question } },
      { url: "/api/blueprints/runs/run-00000001/ask", body: { stepId: "projects", sessionId: "sess-1", question: "Which region, Tokyo?" } },
    ]);
  });
});

describe("gitRootOf", () => {
  it("finds the nearest directory holding .git, and none outside a repository", async () => {
    const root = await tempDir();
    await mkdir(path.join(root, "repo", ".git"), { recursive: true });
    await mkdir(path.join(root, "repo", "src"), { recursive: true });
    expect(await gitRootOf(path.join(root, "repo", "src"))).toBe(path.join(root, "repo"));
    expect(await gitRootOf(root)).not.toBe(path.join(root, "repo"));
  });
});

// The layout `git worktree add` writes (git 2.x): the worktree's .git is a file naming its gitdir,
// and that gitdir's commondir leads back to the main repository's .git.
const worktreeLayout = async (root: string): Promise<{ main: string; worktree: string }> => {
  const main = path.join(root, "main");
  const gitdir = path.join(main, ".git", "worktrees", "wt");
  await mkdir(gitdir, { recursive: true });
  await writeFile(path.join(gitdir, "commondir"), "../..\n");
  const worktree = path.join(root, "elsewhere", "wt");
  await mkdir(worktree, { recursive: true });
  await writeFile(path.join(worktree, ".git"), `gitdir: ${gitdir}\n`);
  return { main, worktree };
};

describe("mainRootOf", () => {
  it("finds the main repository's root from a worktree, and nothing from the main checkout itself", async () => {
    const { main, worktree } = await worktreeLayout(await tempDir());
    expect(await mainRootOf(worktree)).toBe(main);
    expect(await mainRootOf(main)).toBeNull();
  });

  it("lets claudeTrusts count trust recorded at the main root for a folder deep in the worktree", async () => {
    const root = await tempDir();
    const { main, worktree } = await worktreeLayout(root);
    await mkdir(path.join(worktree, "docs", "ja"), { recursive: true });
    const config = path.join(root, "claude.json");
    await writeFile(config, JSON.stringify({ projects: { [main]: { hasTrustDialogAccepted: true } } }));
    expect(await claudeTrusts(path.join(worktree, "docs", "ja"), config)).toBe(true);
    await writeFile(config, JSON.stringify({ projects: { [root]: { hasTrustDialogAccepted: true } } }));
    expect(await claudeTrusts(path.join(worktree, "docs", "ja"), config)).toBe(false);
  });

  it("leaves a .git file without a commondir (a submodule) alone", async () => {
    const root = await tempDir();
    await mkdir(path.join(root, "modules", "sub"), { recursive: true });
    await mkdir(path.join(root, "sub"));
    await writeFile(path.join(root, "sub", ".git"), "gitdir: ../modules/sub\n");
    expect(await mainRootOf(path.join(root, "sub"))).toBeNull();
  });

  it("gives nothing for a worktree of a bare repository, which has no main checkout", async () => {
    const root = await tempDir();
    await mkdir(path.join(root, "repo.git", "worktrees", "wt"), { recursive: true });
    await writeFile(path.join(root, "repo.git", "worktrees", "wt", "commondir"), "../..\n");
    await mkdir(path.join(root, "wt"));
    await writeFile(path.join(root, "wt", ".git"), `gitdir: ${path.join(root, "repo.git", "worktrees", "wt")}\n`);
    expect(await mainRootOf(path.join(root, "wt"))).toBeNull();
  });

  it("gives nothing for a folder with no .git", async () => {
    expect(await mainRootOf(await tempDir())).toBeNull();
  });
});

describe("gitdirOf", () => {
  it.each([
    ["an absolute gitdir", "gitdir: /repo/.git/worktrees/wt\n", "/repo/.git/worktrees/wt"],
    ["a relative gitdir, against the worktree root", "gitdir: ../repo/.git/worktrees/wt", "/work/repo/.git/worktrees/wt"],
    ["a CRLF file", "gitdir: /repo/.git/worktrees/wt\r\n", "/repo/.git/worktrees/wt"],
    ["no gitdir line", "something else\n", null],
    ["an empty gitdir", "gitdir:   \n", null],
    ["an empty file", "", null],
  ])("%s", (_label, text, expected) => {
    expect(gitdirOf(text, "/work/wt")).toBe(expected === null ? null : path.resolve(expected));
  });
});

describe("isTrustedByClaude", () => {
  const projects = { "/Users/me/ss": { hasTrustDialogAccepted: true }, "/Users/me/ss/untrusted": { hasTrustDialogAccepted: false } };

  it.each([
    ["the trusted directory itself", "/Users/me/ss", true],
    ["a new directory under it", "/Users/me/ss/llm/new-app", true],
    ["a child whose own entry says false, under a trusted parent", "/Users/me/ss/untrusted", true],
    ["a sibling of it", "/Users/me/other", false],
    ["a prefix that is not an ancestor", "/Users/me/ssx/app", false],
    ["the root", "/", false],
  ])("%s", (_label, dir, expected) => {
    expect(isTrustedByClaude(dir, projects)).toBe(expected);
  });

  it.each([
    ["a repository root under a trusted parent", "/Users/me/ss/app", "/Users/me/ss/app", false],
    ["a subdirectory of that repository", "/Users/me/ss/app/src", "/Users/me/ss/app", false],
    ["a subdirectory of a trusted repository root", "/Users/me/ss/src", "/Users/me/ss", true],
    ["a directory in no repository", "/Users/me/ss/app", null, true],
    ["a git root that is not above the directory", "/Users/me/ss/app", "/elsewhere/repo", false],
  ])("%s", (_label, dir, gitRoot, expected) => {
    expect(isTrustedByClaude(dir, projects, gitRoot)).toBe(expected);
  });

  it.each([
    ["a worktree of a trusted repository, under an untrusted parent", "/tmp/wt/src", "/tmp/wt", "/Users/me/ss", true],
    ["a worktree of an untrusted repository, under a trusted parent", "/Users/me/ss/wt/src", "/Users/me/ss/wt", "/elsewhere/repo", false],
    ["a worktree with no main root known", "/tmp/wt", "/tmp/wt", null, false],
    ["a worktree whose own path is trusted while its main repository is not", "/Users/me/ss/src", "/Users/me/ss", "/elsewhere/repo", false],
  ])("%s", (_label, dir, gitRoot, mainRoot, expected) => {
    expect(isTrustedByClaude(dir, projects, gitRoot, mainRoot)).toBe(expected);
  });

  it("matches a key written in another form of the same path", () => {
    expect(isTrustedByClaude("/Users/me/ss/app", { "/Users/me/ss/": { hasTrustDialogAccepted: true } })).toBe(true);
    expect(isTrustedByClaude("/Users/me/ss/app", { "/Users/me/ss/../ss": { hasTrustDialogAccepted: true } })).toBe(true);
  });

  it.each([null, undefined, [], "x", { "/": { hasTrustDialogAccepted: "true" } }])("trusts nothing from %o", (value) => {
    expect(isTrustedByClaude("/Users/me/ss", value)).toBe(false);
  });
});
