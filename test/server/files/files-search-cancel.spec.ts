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

vi.mock("../../../server/git/worktrees.js", async (orig) => {
  const actual = await orig<typeof import("../../../server/git/worktrees.js")>();
  return {
    ...actual,
    git: (_args: string[], _cwd?: string, _timeoutMs?: number, signal?: AbortSignal) => {
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

// A `code: null` from the FIRST attempt is not a reason to try the other mode. It means no process
// and no exit status — timed out, killed, cancelled, never spawned — and none of those say anything
// about whether this directory is a repository.
//
// Falling through anyway turns a repository search that TIMED OUT into a successful `no-index`
// answer over the same directory with `.gitignore` unapplied: `node_modules` presented as a result.
// That is the invalid-regex bug wearing different clothes, and it was found by the reviewer reading
// what the new `code: null` could now mean (Codex, round 4).
describe("a first attempt that produced no exit status", () => {
  it("does not retry without .gitignore, and says the search could not run", async () => {
    answerGitWith = { ok: false, stdout: "", code: null };
    const base = await listening();
    const res = await fetch(searchUrl(base));

    expect(res.status).toBe(422);
    // ONE subprocess. A second would be the fallback running on a directory whose repo-ness this
    // outcome says nothing about.
    expect(handedToGit).toHaveLength(1);
  });

  // The control: a real refusal FROM git — it ran and exited 128 — is exactly the case the fallback
  // exists for, so that one must still try the second mode.
  it("still retries when git ran and refused", async () => {
    answerGitWith = { ok: false, stdout: "", code: 128 };
    const base = await listening();
    await fetch(searchUrl(base));
    expect(handedToGit).toHaveLength(2);
  });
});
