// @vitest-environment node
//
// The server's switch to manifold for ShapeScript CSG (infra/tools/shapescript-csg.ts):
// after it, a conversion that names no engine uses manifold.
import { describe, it, expect, afterEach } from "vitest";
import { csgEngineFor, setDefaultCsgEngine } from "@gui-chat-plugin/shapescript";
import { enableShapeScriptManifold } from "../../../server/infra/tools/shapescript-csg.js";

describe("enableShapeScriptManifold", () => {
  afterEach(() => setDefaultCsgEngine("three-bvh-csg"));

  it("makes manifold the engine of every conversion that names none, without a warning", async () => {
    expect(csgEngineFor()).toBe("three-bvh-csg");
    const warnings: string[] = [];
    await enableShapeScriptManifold((message) => warnings.push(message));
    expect(csgEngineFor()).toBe("manifold");
    // A conversion that names its engine keeps it.
    expect(csgEngineFor("three-bvh-csg")).toBe("three-bvh-csg");
    expect(warnings).toEqual([]);
  });
});
