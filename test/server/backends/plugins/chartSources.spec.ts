// @vitest-environment node
// A chart entry may name a range of a saved spreadsheet instead of carrying its
// numbers. The host calculates the range with the spreadsheet package's engine
// and hands it to the chart plugin, both when presentChart runs and when the
// chart View asks again through POST /api/plugin/presentChart.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import express from "express";

import { appRequest } from "../../../helpers/appRequest.js";
import { initArtifactsBackend } from "../../../../server/backends/plugins/artifacts.js";
import { chartSources, isWorkbookPath, workspaceRelativeArtifact } from "../../../../server/backends/plugins/chartSources.js";
import { mountAllRoutes, plugins } from "../../../../server/infra/tools/plugins-registry.js";

const WORKBOOK_PATH = "artifacts/spreadsheets/2026/10/sales.json";
const WORKBOOK = [
  {
    name: "Data",
    data: [
      [{ v: "Month" }, { v: "Sales" }],
      [{ v: "Jan" }, { v: 1200, f: "#,##0" }],
      [{ v: "Feb" }, { v: "=B2/2" }],
    ],
  },
  { name: "Summary", data: [[{ v: "Total" }, { v: "=SUM(Data!B2:B3)" }]] },
];

let workspace: string;

beforeAll(() => {
  workspace = mkdtempSync(path.join(tmpdir(), "mt-chart-src-"));
  const absolute = path.join(workspace, WORKBOOK_PATH);
  mkdirSync(path.dirname(absolute), { recursive: true });
  writeFileSync(absolute, JSON.stringify(WORKBOOK));
  initArtifactsBackend({ workspace });
});

afterAll(() => {
  rmSync(workspace, { recursive: true, force: true });
});

describe("chartSources", () => {
  it("reads a range calculated, with formatted numbers kept as numbers", async () => {
    expect(await chartSources.read({ spreadsheet: WORKBOOK_PATH, range: "Data!A1:B3" })).toEqual([
      ["Month", "Sales"],
      ["Jan", 1200],
      ["Feb", 600],
    ]);
  });

  it("follows a reference into another sheet", async () => {
    expect(await chartSources.read({ spreadsheet: WORKBOOK_PATH, range: "Summary!B1" })).toEqual([[1800]]);
  });

  // The agent is told the absolute path of a saved spreadsheet, so that is what it writes.
  it("reads a workbook named by its absolute path", async () => {
    const absolute = path.join(workspace, WORKBOOK_PATH);
    expect(await chartSources.read({ spreadsheet: absolute, range: "Data!B2" })).toEqual([[1200]]);
  });

  it("refuses a path outside artifacts/spreadsheets/ and an unknown sheet", async () => {
    await expect(chartSources.read({ spreadsheet: "artifacts/charts/x.json", range: "A1" })).rejects.toThrow(/artifacts\/spreadsheets/);
    await expect(chartSources.read({ spreadsheet: WORKBOOK_PATH, range: "Nope!A1" })).rejects.toThrow(/no sheet named "Nope"/);
  });
});

describe("workspaceRelativeArtifact", () => {
  const root = path.join(path.sep, "ws", "artifacts");

  it("turns an absolute path inside the artifacts root into the workspace-relative form", () => {
    expect(workspaceRelativeArtifact(path.join(root, "spreadsheets", "2026", "10", "a.json"), root)).toBe("artifacts/spreadsheets/2026/10/a.json");
  });

  it("leaves a relative path, and an absolute one outside the root, unchanged", () => {
    expect(workspaceRelativeArtifact("artifacts/spreadsheets/a.json", root)).toBe("artifacts/spreadsheets/a.json");
    const outside = path.join(path.sep, "elsewhere", "artifacts", "spreadsheets", "a.json");
    expect(workspaceRelativeArtifact(outside, root)).toBe(outside);
    expect(workspaceRelativeArtifact(root, root)).toBe(root);
  });
});

describe("isWorkbookPath", () => {
  it("matches a workbook, relative or absolute", () => {
    expect(isWorkbookPath("artifacts/spreadsheets/2026/10/a.json")).toBe(true);
    expect(isWorkbookPath("/home/u/mulmoclaude/artifacts/spreadsheets/2026/10/a.json")).toBe(true);
  });

  it("does not match another artifact, another extension, or a climbing path", () => {
    expect(isWorkbookPath("artifacts/charts/2026/10/a.chart.json")).toBe(false);
    expect(isWorkbookPath("artifacts/spreadsheets/2026/10/a.csv")).toBe(false);
    expect(isWorkbookPath("artifacts/spreadsheets/../secrets/a.json")).toBe(false);
    expect(isWorkbookPath("myartifacts/spreadsheets/a.json")).toBe(false);
  });
});

describe("presentChart with a source", () => {
  const app = express();
  app.use(express.json());
  mountAllRoutes(app);
  const request = appRequest(app);

  it("answers the View's readSource dispatch with the calculated rows", async () => {
    const res = await request("/api/plugin/presentChart", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind: "readSource", source: { spreadsheet: WORKBOOK_PATH, range: "Data!A2:B3" } }),
    });
    expect(res.status).toBe(200);
    const body: unknown = await res.json();
    expect(body).toMatchObject({
      data: {
        rows: [
          ["Jan", 1200],
          ["Feb", 600],
        ],
      },
    });
  });

  it("tells the agent which range could not be read when the tool runs", async () => {
    const presentChart = plugins.find((plugin) => plugin.toolName === "presentChart");
    const result: unknown = await presentChart?.execute({
      document: { charts: [{ source: { spreadsheet: WORKBOOK_PATH, range: "Nope!A1:B2" }, option: {} }] },
    });
    expect(result).toMatchObject({ message: expect.stringContaining('no sheet named "Nope"') });
  });
});
