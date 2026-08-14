// The preview payload, over HTTP, for the pane that draws it.
//
// A GET rather than a field on some larger state: the answer changes every time the author edits a
// page or a declaration, and nothing in this server watches for that. It is asked when somebody
// wants to look, which is the same reason the self-containment check beside it is a button.
//
// It carries no `confirm` and takes no body, because it has nothing to confirm — `previewSharedApp`
// writes nothing. That is worth saying at the route, where a future reader deciding to "just add a
// POST that also deploys" would otherwise have to go and read the backend to find out.
//
// MulmoTerminal's own route. MulmoClaude has no counterpart to match — an app is a REPOSITORY and
// that host is single-root — which is the same reason `manageSharedApp` lives here.
import type { Express, Request, Response } from "express";
import { access } from "node:fs/promises";
import path from "node:path";
import { APP_MANIFEST_FILE } from "@mulmoclaude/core/collection/server";
import { previewSharedApp } from "./sharedApp/preview.js";
import { workspaceForRoute } from "../routes/routeParams.js";
import type { SharedAppPreview, SharedAppPreviewResponse } from "../../common/sharedAppPreview.js";

const messageOf = (err: unknown): string => (err instanceof Error ? err.message : String(err));

/** Does this directory declare a shared app at all? Asked before anything else so the ordinary
 *  answer — "no, it is just a directory" — costs one `stat` rather than a Firestore session. */
async function declaresAnApp(root: string): Promise<boolean> {
  try {
    await access(path.join(root, APP_MANIFEST_FILE));
    return true;
  } catch {
    return false;
  }
}

/** The one way this pair of routes fails.
 *
 *  `headersSent` is checked because the handlers write their own answers — a throw after that would
 *  otherwise try to write a finished response and log `ERR_HTTP_HEADERS_SENT` over the real cause.
 *
 *  The message goes to the LOG and a fixed string to the browser: a Firestore error carries absolute
 *  paths off this machine and internals of a database the page has no business learning about. */
function fail(res: Response, err: unknown): void {
  console.error(`[shared-app preview] ${messageOf(err)}`);
  if (!res.headersSent) res.status(500).json({ error: "the preview could not be computed" });
}

async function respondPreview(req: Request, res: Response): Promise<void> {
  // The cell's directory, not the workspace. An app IS a repository, so "preview this app" means
  // the one the cell is open in — resolving it to the workspace would preview a different app than
  // the author is looking at, which is exactly the mistake `manageSharedApp` is scoped to avoid.
  const cwd = workspaceForRoute(req.query.cwd, res);
  if (cwd === null) return;

  // A directory with no `app.json` is not an error. Most directories are not shared apps, and the
  // pane asks about whichever one the cell happens to be open in — answering 404 would make the
  // ordinary case look like a fault in the server log.
  if (!(await declaresAnApp(cwd))) {
    res.json({ declared: false });
    return;
  }

  const result = await previewSharedApp(cwd);
  if (!result.ok) {
    // 200 with the problems on it. The declaration being wrong is an answer to the question asked,
    // not a failure to answer it — and the pane's whole job is to put those problems in front of
    // the author, which it cannot do from a status code.
    res.json({ declared: true, ok: false, problems: result.problems } satisfies SharedAppPreviewResponse);
    return;
  }
  // The WIRE shape, named field by field rather than spread. `previewSharedApp` also carries the
  // full published projection and the generated form's inputs, which this pane has no use for and
  // which would go to the browser for nobody to read.
  const preview: SharedAppPreview = {
    aid: result.aid,
    pages: result.pages,
    publicOpen: result.publicOpen,
    fromLiveApp: result.fromLiveApp,
    generatedForm: result.generatedForm,
    datasets: result.datasets,
    unreadable: result.unreadable,
    warnings: result.warnings,
  };
  res.json({ declared: true, ok: true, preview } satisfies SharedAppPreviewResponse);
}

export function mountSharedAppPreviewRoutes(app: Express): void {
  // "Is there anything to preview here?" — one `stat`, and its own route rather than a flag on the
  // one below. The pane asks it for every directory a cell is open in, and computing a whole
  // publish projection to answer "no" would put a Firestore session behind a question about a
  // file's existence.
  app.get("/api/shared-app/declared", (req, res) => {
    void (async () => {
      try {
        const cwd = workspaceForRoute(req.query.cwd, res);
        if (cwd === null) return;
        res.json({ declared: await declaresAnApp(cwd) });
      } catch (err) {
        // `declaresAnApp` swallows its own failures, but the guard and the write can still throw,
        // and an unhandled rejection here is a request that never gets an answer at all.
        fail(res, err);
      }
    })();
  });

  app.get("/api/shared-app/preview", (req, res) => {
    void (async () => {
      try {
        await respondPreview(req, res);
      } catch (err) {
        fail(res, err);
      }
    })();
  });
}
