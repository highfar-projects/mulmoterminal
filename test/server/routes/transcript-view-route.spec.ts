// @vitest-environment node
//
// The /api/transcript/view contract, pinned at the route (#2112).
//
// What is worth pinning HERE rather than in the reader's own spec is what the route decides on its
// own: which requests it refuses. A cursor is the one input a client sends back rather than types,
// so a malformed one means a bug somewhere — and answering it with the NEWEST page is the dangerous
// reply: a pane asking for "older" would append the turns it is already showing, and keep asking.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import express from "express";
import { routeCall } from "../../helpers/routeCall";
import { mountSessionRoutes } from "../../../server/routes/session-routes";
import { projectSessionsDir } from "../../../server/session/project-dir";

const SESSION = "11111111-2222-4333-8444-555555555555";

const app = express();
mountSessionRoutes(app, { freshenRosterTitle: () => {}, publishActivity: () => {}, agentOfSession: () => null });
const call = routeCall(app);
const get = (query: Record<string, string>) => call(`/api/transcript/view?${new URLSearchParams(query)}`);

let home = "";
let cwd = "";

beforeEach(async () => {
  home = await fs.mkdtemp(path.join(os.tmpdir(), "mt-transcript-route-"));
  vi.spyOn(os, "homedir").mockReturnValue(home);
  cwd = path.join(home, "ws");
  await fs.mkdir(cwd, { recursive: true });
  const dir = projectSessionsDir(cwd);
  await fs.mkdir(dir, { recursive: true });
  const line = (record: unknown): string => `${JSON.stringify(record)}\n`;
  await fs.writeFile(
    path.join(dir, `${SESSION}.jsonl`),
    line({ type: "user", timestamp: "2026-09-17T00:00:00.000Z", message: { role: "user", content: "ask" } }) +
      line({ type: "assistant", timestamp: "2026-09-17T00:00:01.000Z", message: { role: "assistant", content: [{ type: "text", text: "answer" }] } }),
  );
});

afterEach(async () => {
  vi.restoreAllMocks();
  await fs.rm(home, { recursive: true, force: true });
});

describe("GET /api/transcript/view", () => {
  it("answers the newest page and the cursor beside it", async () => {
    const res = await get({ session: SESSION, cwd });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      view: {
        status: "ok",
        turns: [
          {
            at: "2026-09-17T00:00:00.000Z",
            rows: [
              { kind: "user", text: "ask" },
              { kind: "assistant", text: "answer" },
            ],
          },
        ],
        truncated: false,
      },
      older: null,
    });
  });

  it.each([["not-a-cursor"], ["claude:-1"], ["7"], ["claude:"], ["nosuchagent:1"]])(
    "refuses the malformed cursor %j rather than answering the newest page",
    async (before) => {
      const res = await get({ session: SESSION, cwd, before });
      expect(res.status).toBe(400);
    },
  );

  // PRESENT but not a string — `?before=a&before=b` is an array — is a bad cursor, not an absent
  // one. Falling back to "no cursor" answered "give me older" with the NEWEST page (#2115).
  //
  // This goes RED against the line that shipped (`typeof === "string" ? … : null`), which is the
  // regression it exists for. It does NOT distinguish the explicit type check from the parse that
  // follows it — an array stringifies with a comma and the cursor pattern rejects it either way.
  it("refuses a `before` that is not a string", async () => {
    const res = await call(`/api/transcript/view?session=${SESSION}&cwd=${encodeURIComponent(cwd)}&before=a&before=b`);
    expect(res.status).toBe(400);
  });

  // An absent `before` and an empty one are the same request: the newest page. A client that builds
  // its query from a null cursor should not be refused for the spelling.
  it("treats an empty cursor as no cursor", async () => {
    expect((await get({ session: SESSION, cwd, before: "" })).status).toBe(200);
  });

  it("refuses a session id that is not one", async () => {
    expect((await get({ session: "../etc/passwd", cwd })).status).toBe(400);
  });
});
