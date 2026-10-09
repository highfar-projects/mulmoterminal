// Host wiring for @gui-chat-plugin/shapescript (presentShapeScript). The tool-call
// path — save a new `.shape` under artifacts/shapes, or present one that already
// exists — runs through the generic package loader (plugins.json `packages` →
// /api/plugin/presentShapeScript with the FileOps context from
// infra/tools/plugins-registry.ts). This module adds the one host-specific piece:
//
//   The View's source-editor DISPATCH. `useRuntime().dispatch({kind})` POSTs to the
//   SAME /api/plugin/presentShapeScript route with `kind: "loadShape"|"saveShape"`,
//   which the package's `execute` does not handle. Intercept those before the generic
//   catch-all and route them to executeShapeScriptDispatch (read/write via the
//   artifacts FileOps, plus byPath for a `.shape` outside artifacts/shapes); a
//   tool-call (no `kind`) falls through. After a save we publish a file-change so any
//   open View live-refreshes.
//
// The route itself is shared with backends/plugins/html.ts (sourceEditorDispatchRoute.ts), since the
// two plugins share this contract.
import type { Express } from "express";
import { executeShapeScriptDispatch, isShapeScriptDispatchArgs } from "@gui-chat-plugin/shapescript";
import { artifactsFileOps } from "./artifacts.js";
import { shapeScriptByPath } from "../files/openPath.js";
import { mountSourceEditorDispatchRoute } from "../files/sourceEditorDispatchRoute.js";

/** Intercept the View's dispatch (loadShape/saveShape) on
 *  /api/plugin/presentShapeScript, before the generic plugin catch-all (which handles
 *  the tool-call). MUST be registered BEFORE mountAllRoutes. */
export function mountShapeScriptDispatchRoute(app: Express): void {
  mountSourceEditorDispatchRoute(app, {
    route: "/api/plugin/presentShapeScript",
    loadKind: "loadShape",
    saveKind: "saveShape",
    isDispatchArgs: isShapeScriptDispatchArgs,
    invalidArgsError: "invalid presentShapeScript dispatch args",
    // `byPath` is what lets the source editor load/save a model OUTSIDE
    // artifacts/shapes — presentShapeScript's `path` form takes any .shape on disk.
    // Without it the package degrades to its artifacts-only behaviour.
    execute: (args) => executeShapeScriptDispatch({ files: { artifacts: artifactsFileOps, byPath: shapeScriptByPath } }, args),
  });
}
