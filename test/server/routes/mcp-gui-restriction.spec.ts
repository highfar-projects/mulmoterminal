// @vitest-environment node
// A session a spawnBackgroundChat caller limited to some GUI tool groups (#3033), as the MCP routes
// serve it. The spawn hands it only its groups, but a resumed cell loads whatever the worktree's own
// `.mcp.json` registers and a session id in a url is not a credential — so the routes are where the
// limit actually holds.
import { describe, it, expect, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import { rmSync } from "node:fs";
import express from "express";
import { routeCall, jsonPost } from "../../helpers/routeCall";
import { makeTempDir } from "../../support/tempDir";
import { isRecord } from "../../../common/isRecord.js";

// The registry derives MULMOTERMINAL_HOME from the home directory at import time and persists what
// it learns, so HOME points somewhere disposable first (see full-gui-claim.spec.ts).
const HOME = makeTempDir("mt-gui-restriction-");
const REAL_HOME = process.env.HOME;
process.env.HOME = HOME;
const { mountMcpRoutes } = await import("../../../server/routes/mcp-routes.js");
const { rememberGuiGroupRestriction, hasAllGuiTools, sessionToolGroups } = await import("../../../server/session/registry.js");
const { drainPersistQueues } = await import("../../../server/session/reaping/persist-drain.js");

afterAll(async () => {
  await drainPersistQueues();
  if (REAL_HOME === undefined) delete process.env.HOME;
  else process.env.HOME = REAL_HOME;
  rmSync(HOME, { recursive: true, force: true });
});

const app = express();
app.use(express.json());
mountMcpRoutes(app, { publish: () => {}, guiCallHistory: () => null });
const call = routeCall(app);
const ACCEPT = { accept: "application/json, text/event-stream" };

// The route answers as SSE, so the JSON-RPC body arrives on a `data:` line.
function rpcResult(text: string): Record<string, unknown> {
  const line = text.split("\n").find((l) => l.startsWith("data:"));
  const payload: unknown = JSON.parse((line ?? "").replace(/^data:\s*/, ""));
  return isRecord(payload) && isRecord(payload.result) ? payload.result : {};
}

async function listedTools(route: string): Promise<string[]> {
  const { tools } = rpcResult((await call(route, jsonPost({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }, ACCEPT))).text);
  return Array.isArray(tools) ? tools.flatMap((tool) => (isRecord(tool) && typeof tool.name === "string" ? [tool.name] : [])) : [];
}

async function callRefusal(route: string, name: string): Promise<string> {
  const result = rpcResult((await call(route, jsonPost({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name, arguments: {} } }, ACCEPT))).text);
  const first = Array.isArray(result.content) ? result.content[0] : undefined;
  return result.isError === true && isRecord(first) && typeof first.text === "string" ? first.text : "";
}

const restricted = (groups: Parameters<typeof rememberGuiGroupRestriction>[1]): string => {
  const id = randomUUID();
  rememberGuiGroupRestriction(id, groups);
  return id;
};

describe("the all-tools url, reached by a limited session", () => {
  it("serves only the limited groups' tools — not the ungrouped spawn tool", async () => {
    const id = restricted(["render"]);
    const tools = await listedTools(`/api/mcp/${id}`);
    expect(tools).toContain("presentHtml");
    expect(tools).not.toContain("manageCollection");
    expect(tools).not.toContain("spawnBackgroundChat");
  });

  it("is not recorded as carrying every tool, and credits only the limited groups", async () => {
    const id = restricted(["render"]);
    await listedTools(`/api/mcp/${id}`);
    expect(hasAllGuiTools(id)).toBe(false);
    expect(sessionToolGroups(id)).toEqual(["render"]);
  });

  it("refuses a tool outside the limit when it is named anyway", async () => {
    const id = restricted(["render"]);
    expect(await callRefusal(`/api/mcp/${id}`, "spawnBackgroundChat")).toMatch(/not available to this session/);
  });
});

describe("a group url, reached by a limited session", () => {
  it("serves a group inside the limit as usual", async () => {
    const id = restricted(["render"]);
    expect(await listedTools(`/api/mcp/render/${id}`)).toContain("presentHtml");
    expect(sessionToolGroups(id)).toEqual(["render"]);
  });

  // The worktree's own `.mcp.json` may register a group the session was limited out of. It connects,
  // serves nothing, and is not learned — so the Canvas gate does not credit it either.
  it("serves nothing for a group outside the limit, and does not learn it", async () => {
    const id = restricted(["data"]);
    expect(await listedTools(`/api/mcp/render/${id}`)).toEqual([]);
    expect(sessionToolGroups(id)).toEqual([]);
  });

  it("serves nothing anywhere for a session limited to no group", async () => {
    const id = restricted([]);
    expect(await listedTools(`/api/mcp/${id}`)).toEqual([]);
    expect(await listedTools(`/api/mcp/data/${id}`)).toEqual([]);
  });
});

describe("a session that was never limited", () => {
  it("keeps every tool and the all-tools record, exactly as before", async () => {
    const id = randomUUID();
    const tools = await listedTools(`/api/mcp/${id}`);
    expect(tools).toContain("spawnBackgroundChat");
    expect(tools).toContain("manageCollection");
    expect(hasAllGuiTools(id)).toBe(true);
  });
});
