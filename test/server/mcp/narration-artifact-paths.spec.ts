// @vitest-environment node
import path from "node:path";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { describe, it, expect, afterEach, vi } from "vitest";

import { absolutizeArtifactPaths } from "../../../server/mcp/narration-artifact-paths.js";
import { buildGuiMcpServer } from "../../../server/mcp/broker.js";
import { initArtifactsBackend } from "../../../server/backends/plugins/artifacts.js";
import { plugins } from "../../../server/infra/tools/plugins-registry.js";
import { isRecord } from "../../../common/isRecord.js";
import { callTool, stubFetch } from "../../helpers/guiMcpClient.js";

const ROOT = path.join(path.sep, "home", "u", "mulmoclaude", "artifacts");
const root = () => ROOT;
const under = (...segments: string[]) => path.join(ROOT, ...segments);

describe("absolutizeArtifactPaths — paths it rewrites", () => {
  it("rewrites the spreadsheet plugin's own sentence", () => {
    const narration = "Created spreadsheet: Budget. Saved to artifacts/spreadsheets/2026/10/ab.json; the user can edit cells there.";
    expect(absolutizeArtifactPaths(narration, root)).toBe(
      `Created spreadsheet: Budget. Saved to ${under("spreadsheets", "2026", "10", "ab.json")}; the user can edit cells there.`,
    );
  });

  it("keeps sentence punctuation after the path outside it", () => {
    expect(absolutizeArtifactPaths("Saved chart document to artifacts/charts/a.chart.json.", root)).toBe(
      `Saved chart document to ${under("charts", "a.chart.json")}.`,
    );
  });

  it("rewrites a path at the very start, and inside quotes, backticks and brackets", () => {
    expect(absolutizeArtifactPaths("artifacts/a.json", root)).toBe(under("a.json"));
    expect(absolutizeArtifactPaths('"artifacts/a.json"', root)).toBe(`"${under("a.json")}"`);
    expect(absolutizeArtifactPaths("`artifacts/a.json`", root)).toBe(`\`${under("a.json")}\``);
    expect(absolutizeArtifactPaths("(artifacts/a.json)", root)).toBe(`(${under("a.json")})`);
  });

  it("rewrites every path in a multi-line narration", () => {
    const out = absolutizeArtifactPaths("Saved artifacts/a.json\nand artifacts/b/c.json", root);
    expect(out).toBe(`Saved ${under("a.json")}\nand ${under("b", "c.json")}`);
  });
});

describe("absolutizeArtifactPaths — text it leaves alone", () => {
  it.each([
    ["no path at all", "Done"],
    ["an empty narration", ""],
    ["an already-absolute path", "Saved STL to /home/u/mulmoclaude/artifacts/shapes/x.stl (12 bytes)."],
    ["the word without a slash", "The artifacts area is shared."],
    ["a bare prefix", "Look in artifacts/ for it."],
    ["a path climbing out with ..", "Saved to artifacts/../secret.json"],
    ["a path climbing out with Windows separators", "Saved to artifacts/foo\\..\\..\\secret.json"],
    ["a path holding any backslash", "Saved to artifacts/charts\\a.json"],
    ["a longer word ending in the prefix", "See myartifacts/a.json"],
  ])("%s", (_label, narration) => {
    expect(absolutizeArtifactPaths(narration, root)).toBe(narration);
  });

  it("does not ask for the root when nothing needs it", () => {
    const lookup = vi.fn(root);
    absolutizeArtifactPaths("Rendered.", lookup);
    expect(lookup).not.toHaveBeenCalled();
  });
});

describe("the broker tells claude the absolute path, and the GUI the relative one", () => {
  const originalFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  const textOf = (content: unknown): string => {
    const first: unknown = Array.isArray(content) ? content[0] : undefined;
    return isRecord(first) && typeof first.text === "string" ? first.text : "";
  };
  const postedToolResult = (calls: unknown[][]): unknown => {
    const call = calls.find(([url]) => String(url).includes("/api/agent/toolResult"));
    const init: unknown = call?.[1];
    return isRecord(init) && typeof init.body === "string" ? JSON.parse(init.body) : undefined;
  };

  it("for a real presentSpreadsheet result", async () => {
    const workspace = await mkdtemp(path.join(tmpdir(), "mt-narration-"));
    initArtifactsBackend({ workspace });
    const spreadsheet = plugins.find((plugin) => plugin.toolName === "presentSpreadsheet");
    const envelope: unknown = await spreadsheet?.execute({ title: "Budget", sheets: [{ name: "S", data: [[{ v: 1 }]] }] });
    const relative = isRecord(envelope) && isRecord(envelope.data) ? envelope.data.sheets : undefined;
    if (typeof relative !== "string") throw new Error("the spreadsheet was not saved to a file");
    expect(relative.startsWith("artifacts/spreadsheets/")).toBe(true);

    const fetchSpy = stubFetch(() => ({ status: 200, body: envelope }));
    globalThis.fetch = fetchSpy as unknown as typeof fetch;
    const result = await callTool(buildGuiMcpServer("11111111-1111-4111-8111-111111111111", "http://127.0.0.1:1"), "presentSpreadsheet", {});

    const absolute = path.join(workspace, ...relative.split("/"));
    expect(textOf(result.content)).toContain(`Saved to ${absolute};`);
    await expect(readFile(absolute, "utf8")).resolves.toContain('"v":1');
    const posted = postedToolResult(fetchSpy.mock.calls);
    expect(isRecord(posted) && isRecord(posted.data) ? posted.data.sheets : undefined).toBe(relative);
  });
});
