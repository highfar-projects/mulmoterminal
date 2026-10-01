// The route a plugin View's source editor dispatches to. `useRuntime().dispatch({kind})` POSTs to
// the plugin's own /api/plugin/<tool> route with a load/save `kind` the package's `execute` does
// not handle, so it is intercepted here before the generic catch-all; a tool-call (no `kind`)
// falls through to the package. After a save a file-change is published so an open View
// live-refreshes.
import type { Express, Request, Response, NextFunction } from "express";
import { isRecord } from "../../common/isRecord.js";
import { publishFileChange } from "./fileChange.js";

export interface SourceEditorDispatch<Args extends { kind: string; path: string }> {
  route: string;
  loadKind: Args["kind"];
  saveKind: Args["kind"];
  /** The package's OWN guard, rather than an assertion here: a save carrying a non-string body
   *  would otherwise reach `files.*.write` and blank the artifact. */
  isDispatchArgs: (value: unknown) => value is Args;
  invalidArgsError: string;
  execute: (args: Args) => Promise<unknown>;
}

/** MUST be registered BEFORE mountAllRoutes, whose catch-all would otherwise take the dispatch. */
export function mountSourceEditorDispatchRoute<Args extends { kind: string; path: string }>(app: Express, dispatch: SourceEditorDispatch<Args>): void {
  app.post(dispatch.route, async (req: Request, res: Response, next: NextFunction) => {
    const args: Record<string, unknown> = isRecord(req.body) ? req.body : {};
    if (args.kind !== dispatch.loadKind && args.kind !== dispatch.saveKind) return next();
    if (!dispatch.isDispatchArgs(args)) {
      res.status(400).json({ error: dispatch.invalidArgsError });
      return;
    }
    try {
      const result = await dispatch.execute(args);
      if (args.kind === dispatch.saveKind && typeof args.path === "string") await publishFileChange(args.path);
      res.json(result);
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });
}
