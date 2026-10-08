// @vitest-environment node
//
// What the session routes decide BEFORE they read anything: which `?session=` / `?cwd=` they
// refuse, and — for the listings whose session id is the agent's own (copilot, cursor) — that the
// running-session snapshot is taken before the list is built and a failed read answers 500.
//
// The readers are mocked to record their calls, so a refusal is pinned as "answered AND nothing was
// read", which a status alone cannot tell apart from "read, then answered the same status".
import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";
import { promises as fs } from "node:fs";
import path from "node:path";
import express from "express";
import { routeCall } from "../../helpers/routeCall";
import { takeScratchHome } from "../../support/scratchHome.js";

const scratchHome = takeScratchHome("mt-session-refusals-");
const PROJECT = path.join(scratchHome.path, "project");
const A_FILE = path.join(scratchHome.path, "a-file");
await fs.mkdir(PROJECT, { recursive: true });
await fs.writeFile(A_FILE, "not a directory");

const reads: string[] = [];
const listing = { rows: [] as { id: string; title: string | null; mtimeMs: number }[], fails: false };

vi.mock("../../../server/session/session-reads.js", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  sessionTimeline: async () => (reads.push("timeline"), { events: [], truncated: false }),
  sessionPrompts: async () => (reads.push("prompts"), { prompts: [] }),
  sessionLastTurn: async () => (reads.push("last-turn"), { prompt: null, reply: null }),
}));
vi.mock("../../../server/session/transcript-view-read.js", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  sessionTranscriptPage: async () => (reads.push("view"), { turns: [] }),
}));
vi.mock("../../../server/session/dir-session.js", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  survivorSnapshot: async () => (reads.push("snapshot"), new Set(["copilot-running"])),
}));
vi.mock("../../../server/infra/tmux.js", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  tmuxAttachedCounts: () => null,
}));
const listSessions = async () => {
  reads.push("list");
  if (listing.fails) throw new Error("index unreadable");
  return listing.rows;
};
vi.mock("../../../server/agents/copilot/copilot-sessions.js", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  listCopilotSessionsForCwd: listSessions,
}));
vi.mock("../../../server/agents/cursor/cursor-sessions.js", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  listCursorSessionsForCwd: listSessions,
}));

const { mountSessionRoutes } = await import("../../../server/routes/session-routes.js");

const app = express();
mountSessionRoutes(app, { freshenRosterTitle: () => {}, publishActivity: () => {}, agentOfSession: () => null });
const call = routeCall(app);

afterAll(() => scratchHome.release());
beforeEach(() => {
  reads.length = 0;
  listing.rows = [];
  listing.fails = false;
});

const SESSION = "3d0f1a52-8c41-4b77-9f0e-21336c0a9e7b";
const SESSION_ROUTES = ["/api/transcript/timeline", "/api/transcript/prompts", "/api/transcript/last-turn", "/api/transcript/view"];
const query = (pairs: [string, string][]): string => `?${new URLSearchParams(pairs)}`;

// Every shape a `?session=` arrives in that is not exactly one session id.
const BAD_SESSIONS: [string, string][][] = [
  [],
  [["session", ""]],
  [["session", "not-a-session"]],
  [["session", "../../etc/passwd"]],
  [["session", `${SESSION}x`]],
  [
    ["session", SESSION],
    ["session", SESSION],
  ],
];

// A `?cwd=` the route must refuse rather than answer about some other directory.
const BAD_CWDS: [string, number][] = [
  [path.join(scratchHome.path, "missing"), 404],
  [A_FILE, 404],
];

describe("a route about one session", () => {
  const cases = SESSION_ROUTES.flatMap((route) => BAD_SESSIONS.map((pairs) => [route, pairs] as const));
  it.each(cases)("%s refuses %j without reading", async (route, pairs) => {
    const res = await call(`${route}${query(pairs)}`);
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "invalid session id" });
    expect(reads).toEqual([]);
  });

  const cwdCases = SESSION_ROUTES.flatMap((route) => BAD_CWDS.map(([cwd, status]) => [route, cwd, status] as const));
  it.each(cwdCases)("%s refuses ?cwd=%s with %i without reading", async (route, cwd, status) => {
    const res = await call(
      `${route}${query([
        ["session", SESSION],
        ["cwd", cwd],
      ])}`,
    );
    expect(res.status).toBe(status);
    expect(reads).toEqual([]);
  });

  it.each(SESSION_ROUTES)("%s reads once for a valid session and directory", async (route) => {
    const res = await call(
      `${route}${query([
        ["session", SESSION],
        ["cwd", PROJECT],
      ])}`,
    );
    expect(res.status).toBe(200);
    expect(reads).toHaveLength(1);
  });
});

describe.each(["/api/copilot/sessions", "/api/cursor/sessions"])("%s", (route) => {
  it("takes the running snapshot BEFORE it lists, and joins rows by their own id", async () => {
    listing.rows = [
      { id: "copilot-running", title: null, mtimeMs: 2 },
      { id: "idle", title: "named", mtimeMs: 1 },
    ];
    const res = await call(`${route}${query([["cwd", PROJECT]])}`);
    expect(res.status).toBe(200);
    expect(reads).toEqual(["snapshot", "list"]);
    expect(res.body).toEqual({
      cwd: PROJECT,
      sessions: [
        { id: "copilot-running", title: "copilot-running", mtime: 2, attached: false, runningKey: "copilot-running" },
        { id: "idle", title: "named", mtime: 1, attached: false, runningKey: null },
      ],
    });
  });

  it("answers 500 naming the route when the read fails", async () => {
    listing.fails = true;
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await call(`${route}${query([["cwd", PROJECT]])}`);
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: "Error: index unreadable" });
    expect(logged.mock.calls[0]?.[0]).toBe(`[api] ${route} failed:`);
    logged.mockRestore();
  });

  it.each(BAD_CWDS)("refuses ?cwd=%s with %i without listing", async (cwd, status) => {
    const res = await call(`${route}${query([["cwd", cwd]])}`);
    expect(res.status).toBe(status);
    expect(reads).toEqual([]);
  });
});
