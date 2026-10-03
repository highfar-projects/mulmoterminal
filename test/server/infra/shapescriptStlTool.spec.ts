// @vitest-environment node
//
// The exportShapeScriptStl host tool: a printable STL through manifold
// (WebAssembly, in this process), with a printability report. No browser is
// involved, so every case runs everywhere.
import { describe, it, expect } from "vitest";
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import path from "node:path";
import { initArtifactsBackend } from "../../../server/backends/artifacts.js";
import { initOpenPathBackend, resetOpenPathBackend } from "../../../server/backends/openPath.js";
import { EXPORT_SHAPE_SCRIPT_STL, runExportShapeScriptStl } from "../../../server/infra/shapescript-stl-tool.js";
import { makeTempDir } from "../../support/tempDir";

const ws = makeTempDir("mt-stl-tool-");
const ARTIFACT = "artifacts/shapes/bracket.shape";
const REPO_REL = "models/bracket.shape";
// Two overlapping cubes and no union: the export merges them into one solid.
const TWO_CUBES = "cube\ncube {\n position 0.5 0 0\n}";

mkdirSync(path.join(ws, "artifacts", "shapes"), { recursive: true });
writeFileSync(path.join(ws, ARTIFACT), TWO_CUBES);
mkdirSync(path.join(ws, "models"), { recursive: true });
writeFileSync(path.join(ws, REPO_REL), TWO_CUBES);
initArtifactsBackend({ workspace: ws });
resetOpenPathBackend();
initOpenPathBackend({ workspace: ws });

/** Triangles a binary STL declares, and whether its size agrees: 84 + 50 per triangle. */
const stlTriangles = (file: string): number => {
  const bytes = readFileSync(file);
  const triangles = bytes.readUInt32LE(80);
  expect(bytes).toHaveLength(84 + 50 * triangles);
  return triangles;
};

describe("exportShapeScriptStl host tool", () => {
  it("is offered with the shared contract, not a local copy of it", () => {
    expect(EXPORT_SHAPE_SCRIPT_STL.name).toBe("exportShapeScriptStl");
    expect(EXPORT_SHAPE_SCRIPT_STL.description).toContain("STL");
    expect(Object.keys(EXPORT_SHAPE_SCRIPT_STL.parameters?.properties ?? {})).toEqual(["script", "path", "title", "unitScale"]);
  });

  // ABSOLUTE is the point, as for USDZ: sessions run in per-project directories.
  it("exports an inline script as one solid, answering an absolute path and the report", async () => {
    const { message, filePath } = await runExportShapeScriptStl({ script: TWO_CUBES, title: "Two Cubes", unitScale: 10 });
    expect(path.isAbsolute(filePath)).toBe(true);
    expect(filePath.startsWith(path.join(ws, "artifacts", "shapes"))).toBe(true);
    expect(path.basename(filePath)).toMatch(/^two-cubes-\d+-[0-9a-f]{8}\.stl$/);
    // One path, the absolute one, then the report: two cubes fused, in millimetres.
    expect(message.match(/two-cubes-\d+-[0-9a-f]{8}\.stl/g)).toHaveLength(1);
    expect(message).toContain(filePath);
    expect(message).toContain("Size 15 x 10 x 10 mm, 1 body");
    expect(message).toContain("2 part(s) merged, 0 skipped; 0 non-manifold edges.");
    expect(stlTriangles(filePath)).toBeGreaterThan(0);
  });

  it("exports a saved model by its artifact path and inherits its name", async () => {
    const { filePath } = await runExportShapeScriptStl({ path: ARTIFACT });
    expect(path.basename(filePath)).toMatch(/^bracket-\d+-[0-9a-f]{8}\.stl$/);
    expect(stlTriangles(filePath)).toBeGreaterThan(0);
  });

  it("exports a .shape outside the artifacts root through byPath", async () => {
    const { filePath } = await runExportShapeScriptStl({ path: REPO_REL });
    expect(filePath.startsWith(path.join(ws, "artifacts", "shapes"))).toBe(true);
    expect(stlTriangles(filePath)).toBeGreaterThan(0);
  });

  it("passes warnings through: parts that only touch, a part with nothing to print", async () => {
    const { message } = await runExportShapeScriptStl({ script: "cube\ncube {\n position 1 1 0\n}\ncircle {\n position 4 0 0\n}" });
    expect(message).toMatch(/Warning: \d+ non-manifold edges/);
    expect(message).toMatch(/Warning: 1 part\(s\) skipped/);
  });

  it("refuses a path that is not a .shape file, and a traversal path", async () => {
    await expect(runExportShapeScriptStl({ path: "notes.txt" })).rejects.toThrow(/must name a .shape file/);
    await expect(runExportShapeScriptStl({ path: "artifacts/shapes/../../secrets.shape" })).rejects.toThrow();
  });

  it("requires one source, a positive unitScale, and something to print", async () => {
    await expect(runExportShapeScriptStl({})).rejects.toThrow(/Provide either/);
    await expect(runExportShapeScriptStl({ script: "cube", unitScale: 0 })).rejects.toThrow(/unitScale/);
    await expect(runExportShapeScriptStl({ script: "circle" })).rejects.toThrow(/Nothing to print/);
  });
});
