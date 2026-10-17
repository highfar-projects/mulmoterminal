// @vitest-environment node
// A model's tool call must not reach a View-only branch of /api/plugin/<tool>: the broker refuses a
// `kind` the tool does not offer before anything is dispatched (server/mcp/view-dispatch-kind.ts).
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";

import { buildGuiMcpServer } from "../../../server/mcp/broker.js";
import type { GuiCallRecorder } from "../../../server/mcp/gui-call-history.js";
import { callTool, stubFetch } from "../../helpers/guiMcpClient.js";

const SESSION = "22222222-2222-4222-8222-222222222222";
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});

const dispatchedUrls = (spy: ReturnType<typeof stubFetch>): string[] =>
  spy.mock.calls.map(([url]) => String(url)).filter((url) => url.includes("/api/plugin/"));

describe("buildGuiMcpServer and a View-only kind", () => {
  it.each([
    ["presentSpreadsheet", { kind: "saveSpreadsheet", path: "artifacts/spreadsheets/2026/10/a.json", sheets: [] }],
    ["presentHtml", { kind: "saveHtml", path: "artifacts/html/page.html", html: "<p>x</p>" }],
    ["presentShapeScript", { kind: "saveShape", path: "artifacts/shapes/m.shape", script: "cube" }],
  ])("refuses %s called with its View's save, without dispatching it", async (name, args) => {
    const spy = stubFetch(() => ({ status: 200, body: { message: "saved" } }));
    vi.stubGlobal("fetch", spy);
    const ends: string[] = [];
    const history: GuiCallRecorder = { start: () => {}, end: (call) => void ends.push(call.status) };

    const result = await callTool(buildGuiMcpServer(SESSION, "http://127.0.0.1:1", { history }), name, args);

    expect(result.isError).toBe(true);
    expect(JSON.stringify(result.content)).toContain("reserved for the app's own view");
    expect(dispatchedUrls(spy)).toEqual([]);
    expect(ends).toEqual(["failed"]);
  });

  it("still dispatches a declared kind", async () => {
    const spy = stubFetch(() => ({ status: 200, body: { message: "P&L" } }));
    vi.stubGlobal("fetch", spy);

    const result = await callTool(buildGuiMcpServer(SESSION, "http://127.0.0.1:1"), "manageAccounting", { action: "getReport", kind: "pl" });

    expect(result.isError).toBeFalsy();
    expect(dispatchedUrls(spy)).toEqual(["http://127.0.0.1:1/api/plugin/manageAccounting"]);
  });

  it("still dispatches an ordinary call", async () => {
    const spy = stubFetch(() => ({ status: 200, body: { message: "Created", data: { sheets: "artifacts/spreadsheets/2026/10/a.json" } } }));
    vi.stubGlobal("fetch", spy);

    await callTool(buildGuiMcpServer(SESSION, "http://127.0.0.1:1"), "presentSpreadsheet", { title: "T", sheets: [{ name: "S", data: [[{ v: 1 }]] }] });

    expect(dispatchedUrls(spy)).toEqual(["http://127.0.0.1:1/api/plugin/presentSpreadsheet"]);
  });
});
