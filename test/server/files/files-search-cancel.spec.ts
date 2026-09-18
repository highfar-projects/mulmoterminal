// @vitest-environment node
//
// That the search route STOPS the subprocess when the browser hangs up (#2140).
//
// `git()` honouring an AbortSignal is covered next door in `git-spawn-contract.spec.ts`. This file
// covers the two lines that connect the two: the controller the route builds, and the
// `req.on("close")` that fires it. I claimed in review that they could not be tested, because the
// repo's `routeCall` helper uses `light-my-request`, which injects without a socket — so `close`
// never fires the way a real hang-up makes it. That was true about the HELPER and false about the
// question: a real loopback listener and a real aborted `fetch` reproduce it exactly, and the shape
// came from the reviewer I had put the question to (Codex, round 4 of #2143).
//
// The git module is mocked HERE and nowhere else in this feature's tests, deliberately: every other
// question about searching is about what git really does, and a mock would assert what I believe
// instead. This one is not about git at all — it is about what the route hands it.
import { describe, it, expect, afterEach, vi } from "vitest";
import express from "express";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";

/** The signals the route handed to `git()`, in call order, so a test can watch one abort — and its
 *  length is how many subprocesses the route decided to start. */
const handedToGit: (AbortSignal | undefined)[] = [];
/** Lets a test hold the subprocess open, the way a slow `git grep` on a large repository does. */
let releaseGit: (() => void) | null = null;
/** When set, `git()` answers with this immediately instead of hanging. */
let answerGitWith: { ok: boolean; stdout: string; code: number | null } | null = null;
/** What the route's mode probe is told. Defaults to a repository, which is the ordinary case. */
let insideRepo = true;

vi.mock("../../../server/git/worktrees.js", async (orig) => {
  const actual = await orig<typeof import("../../../server/git/worktrees.js")>();
  return {
    ...actual,
    git: (args: string[], _cwd?: string, _timeoutMs?: number, signal?: AbortSignal) => {
      // The route asks which mode this directory calls for before searching. That probe is not what
      // these tests are about, so it is answered immediately and NOT counted as a search.
      if (args[0] === "rev-parse") return Promise.resolve({ ok: insideRepo, stdout: insideRepo ? "true\n" : "", code: insideRepo ? 0 : 128 });
      handedToGit.push(signal);
      if (answerGitWith) return Promise.resolve(answerGitWith);
      // Never resolves on its own: the request is still "running" until the test says otherwise,
      // which is the only state in which a hang-up means anything.
      return new Promise((resolve) => {
        releaseGit = () => resolve({ ok: false, stdout: "", code: null });
        signal?.addEventListener("abort", () => resolve({ ok: false, stdout: "", code: null }));
      });
    },
  };
});

const { mountFilesBrowseRoutes } = await import("../../../server/files/files-browse.js");

let server: Server | null = null;

afterEach(() => {
  releaseGit?.();
  releaseGit = null;
  answerGitWith = null;
  insideRepo = true;
  handedToGit.length = 0;
  server?.close();
  server = null;
});

/** A real listener on loopback — the point of this file. `light-my-request` cannot answer here. */
async function listening(): Promise<string> {
  const app = express();
  mountFilesBrowseRoutes(app, { defaultCwd: process.cwd(), backupRoot: process.cwd() });
  server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server?.once("listening", resolve));
  return `http://127.0.0.1:${(server?.address() as AddressInfo).port}`;
}

const searchUrl = (base: string): string => `${base}/api/files/browse/search?${new URLSearchParams({ q: "needle" })}`;

describe("a search the browser walks away from", () => {
  it("aborts the signal it gave git", async () => {
    const base = await listening();
    const client = new AbortController();
    const request = fetch(searchUrl(base), { signal: client.signal }).catch(() => null);

    // Wait for the route to have actually started a search — otherwise the abort below could land
    // before the handler runs and the test would pass without exercising anything.
    await vi.waitFor(() => expect(handedToGit).toHaveLength(1));
    const given = handedToGit[0];
    expect(given?.aborted).toBe(false); // the premise: it really was live

    client.abort();
    await vi.waitFor(() => expect(given?.aborted).toBe(true));
    await request;
  });

  // The other half of the guard. `close` fires after a NORMAL response too, and aborting there
  // would kill nothing while telling the next reader something false about when this runs.
  it("does not abort a search whose answer the client is going to get", async () => {
    const base = await listening();
    const request = fetch(searchUrl(base));
    await vi.waitFor(() => expect(handedToGit).toHaveLength(1));
    const given = handedToGit[0];

    releaseGit?.(); // git answers; the route responds normally
    const res = await request;
    await res.text();

    // The response completed, so any `close` that fired did so with `writableEnded` already true.
    expect(given?.aborted).toBe(false);
  });
});

// The mode is ASKED, so a search that fails has no second mode to try. The old shape inferred the
// mode from the first attempt's failure, and that inference drew three separate findings in one
// review — an invalid regex read as "not a repository", a timed-out repository search answered as a
// successful `no-index` result, and a plain directory refused when its probe lost a race under
// load. These pin the shape that replaced it rather than any one of those cases.
describe("the mode is chosen before the search runs", () => {
  it("runs ONE search in a repository, and refuses when it fails", async () => {
    answerGitWith = { ok: false, stdout: "", code: 128 };
    const base = await listening();
    const res = await fetch(searchUrl(base));

    expect(res.status).toBe(422);
    // One search. A second would be the old fallback, re-running the same query with .gitignore
    // unapplied and answering with node_modules.
    expect(handedToGit).toHaveLength(1);
  });

  it("runs ONE search outside a repository, and answers from it", async () => {
    insideRepo = false;
    answerGitWith = { ok: true, stdout: "", code: 1 }; // ran, matched nothing
    const base = await listening();
    const res = await fetch(searchUrl(base));

    expect(res.status).toBe(200);
    const body: unknown = await res.json();
    expect(body).toMatchObject({ source: "no-index" });
    expect(handedToGit).toHaveLength(1);
  });

  // The regression that ended the inference. A first attempt with no exit status — timed out under
  // load — used to decide the mode, so a plain directory whose probe lost that race was refused.
  // The mode no longer depends on how long a grep takes.
  it("still searches a plain directory when a run produces no exit status", async () => {
    insideRepo = false;
    answerGitWith = { ok: false, stdout: "", code: null };
    const base = await listening();
    const res = await fetch(searchUrl(base));

    // The search itself failed, so this is honestly a refusal — but it was attempted in the RIGHT
    // mode, and no reading of a timeout decided that.
    expect(res.status).toBe(422);
    expect(handedToGit).toHaveLength(1);
  });
});
