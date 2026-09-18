// @vitest-environment node
import { describe, it, expect } from "vitest";

import os from "node:os";
import path from "node:path";
import express from "express";
import { routeCall } from "../../helpers/routeCall";
import { parseIndexParam, normalizeAgent, workspaceForRoute } from "../../../server/routes/routeParams.js";
import { CLAUDE_CWD } from "../../../server/config/env.js";

describe("parseIndexParam", () => {
  it("parses a non-negative integer", () => {
    expect(parseIndexParam("0")).toBe(0);
    expect(parseIndexParam("5")).toBe(5);
    expect(parseIndexParam("12")).toBe(12);
  });

  it("is NaN for a missing param", () => {
    expect(parseIndexParam(null)).toBeNaN();
  });

  it("is NaN for anything that isn't a bare non-negative integer", () => {
    for (const raw of ["", "-1", "1.5", "1e2", "abc", " 3", "3 ", "+3", "0x1"]) {
      expect(parseIndexParam(raw)).toBeNaN();
    }
  });
});

describe("normalizeAgent", () => {
  it("selects codex only for an exact 'codex'", () => {
    expect(normalizeAgent("codex")).toBe("codex");
  });

  it("selects antigravity only for an exact 'antigravity'", () => {
    expect(normalizeAgent("antigravity")).toBe("antigravity");
  });

  it("falls back to claude for everything else", () => {
    for (const raw of ["claude", "", "gpt", null, undefined, 5, ["codex"], { agent: "codex" }]) {
      expect(normalizeAgent(raw)).toBe("claude");
    }
  });

  // Case-sensitive on purpose: the value comes from a raw URL, and a mis-cased "CODEX"
  // starting Claude is safer than guessing.
  it("does not match a mis-cased CODEX", () => {
    expect(normalizeAgent("CODEX")).toBe("claude");
    expect(normalizeAgent("Codex")).toBe("claude");
  });
});

// The third argument, and the whole of #2133: a route that is ABOUT one session hands its own
// directory over, and a request that named none is answered about THAT instead of the workspace.
//
// Exercised through a real route rather than a stand-in `Response`, because two of the four cases
// are about what the response became — a refusal already sent, with no `cwd` returned to go on with.
const probe = express();
probe.get("/probe", (req, res) => {
  const own = typeof req.query.own === "string" ? req.query.own : undefined;
  const cwd = workspaceForRoute(req.query.cwd, res, own);
  if (cwd === null) return;
  res.json({ cwd });
});
const askProbe = routeCall(probe);
// The session's own directory is never validated — that is the point of the third argument — so a
// literal is fine here. A directory NAMED by a request is validated, so those two cases below need
// a path that really exists on the platform running them: `/tmp` is absolute on Windows too, which
// is why it reached `workspaceRequest` at all and then 404'd there (CI, test_windows).
const OWN = path.join(os.tmpdir(), "a-session-directory");
const REAL_DIRECTORY = os.tmpdir();
// `workspaceRequest` canonicalizes a directory it accepts (#1002), so the assertion mirrors that
// rather than the raw string. What is under test is WHICH directory wins, not how it is spelled —
// and a hand-written expectation would encode one platform's spelling of the temp path.
const asAnswered = (dir: string): string => path.resolve(dir);
const NO_SUCH_DIRECTORY = path.join(os.tmpdir(), "mt-no-such-directory-2133");

describe("workspaceForRoute", () => {
  it("answers about the session's own directory when the request named none", async () => {
    const res = await askProbe(`/probe?${new URLSearchParams({ own: OWN })}`);
    expect(res.status).toBe(200);
    expect(res.body.cwd).toBe(OWN);
  });

  // The control for the case above: same request, no session to be about. A route reporting on a
  // DIRECTORY passes nothing here and must keep the default it has always had.
  it("keeps the workspace when no own directory is offered", async () => {
    const res = await askProbe("/probe");
    expect(res.status).toBe(200);
    expect(res.body.cwd).toBe(CLAUDE_CWD);
  });

  // #1151 from the other side: a caller that NAMED a directory is asking about that directory, so
  // the session's own must not quietly replace it — not even when the two disagree, which is
  // exactly what a resume somewhere else produces.
  it("lets an explicit ?cwd= win over the session's own directory", async () => {
    const res = await askProbe(`/probe?${new URLSearchParams({ cwd: REAL_DIRECTORY, own: OWN })}`);
    expect(res.status).toBe(200);
    expect(res.body.cwd).toBe(asAnswered(REAL_DIRECTORY));
  });

  // An own directory is a DEFAULT, never a rescue: a `?cwd=` that cannot name a directory is still
  // a malformed request, and a missing one is still a 404. Answering either from the session's own
  // directory would turn a refusal into a plausible-looking wrong answer.
  it("still refuses an unusable ?cwd= rather than falling back to the session's own", async () => {
    const relative = await askProbe(`/probe?${new URLSearchParams({ cwd: "relative/path", own: OWN })}`);
    expect(relative.status).toBe(400);
    expect(relative.body.cwd).toBe("relative/path");
    const gone = await askProbe(`/probe?${new URLSearchParams({ cwd: NO_SUCH_DIRECTORY, own: OWN })}`);
    expect(gone.status).toBe(404);
    expect(gone.body.cwd).toBe(NO_SUCH_DIRECTORY); // the REQUESTED path, echoed back by the refusal
  });
});
