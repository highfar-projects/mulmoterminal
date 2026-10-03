// Evaluate ShapeScript's CSG with manifold on this server: presentShapeScript's
// validation, renderShapeScript, and the USDZ / STL exports. The browser View is
// switched the same way in src/main.ts, so a model is built by one engine
// wherever it is shown or exported.
//
// manifold's results are watertight and keep each operand's material, it is 2-3x
// faster than three-bvh-csg on the shipped models, and a lattice inside a `union`
// builds where three-bvh-csg runs into the time limit. It is WebAssembly loaded
// once, here, before the first request: the converter itself is synchronous.
import { enableManifoldCsg } from "@gui-chat-plugin/shapescript";

/** Switch every conversion in this process to manifold. A failed load leaves
 *  three-bvh-csg in place — ShapeScript still works, the server still starts. */
export async function enableShapeScriptManifold(log: (message: string) => void = console.warn): Promise<void> {
  try {
    await enableManifoldCsg();
  } catch (err) {
    log(`[shapescript] manifold did not load, CSG stays on three-bvh-csg: ${err instanceof Error ? err.message : String(err)}`);
  }
}
