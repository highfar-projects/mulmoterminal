// @vitest-environment node
//
// The two routes the preview pane asks: "is there an app here?" and "what would publishing it
// show?".
//
// What is pinned is the pair of answers that are NOT errors, because both look like faults from a
// status code and neither is: a directory with no `app.json` (most of them), and a declaration
// that publish would refuse (the author's work in progress, and the whole reason the pane exists).
// A route that 404s the first fills the log with normal operation; one that 500s the second hides
// the problems the author needs to read.
import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import express, { type Express } from "express";
import { writeFileSync } from "node:fs";
import path from "node:path";
import { makeTempDir } from "../../support/tempDir";
import { appRequest } from "../../helpers/appRequest.js";

const preview = vi.hoisted(() => vi.fn());

vi.mock("../../../server/backends/sharedApp/preview.js", () => ({ previewSharedApp: preview }));
// The route resolves `?cwd=` through the workspace guard; here the directories are real temp dirs
// and which paths this server may serve is its own file's subject.
//
// The double ANSWERS on the refusing branch, because the real one does — it is the guard that
// writes the 400/404, and the handler returns without touching `res`. A double that merely
// returned null left the request hanging, which is a test that fails by timing out over a route
// that works. The contract being copied is "null means the response is already sent".
vi.mock("../../../server/routes/routeParams.js", () => ({
  workspaceForRoute: (cwd: unknown, res: { status: (code: number) => { json: (body: unknown) => void } }) => {
    if (typeof cwd === "string" && cwd.length > 0) return cwd;
    res.status(400).json({ error: "no cwd" });
    return null;
  },
}));

let app: Express;
let root = "";

/** The route under test, called the way the pane calls it — through the real handler chain, but
 *  over an in-memory socket rather than a listening one.
 *
 *  This file used to open a real `listen(0)` per call and `fetch` it, which is the exact pattern
 *  `appRequest` exists to replace (see its header, and #1314). It is flaky, not merely slow:
 *  measured at 3 failures in 2000 round trips of this shape, arriving as `other side closed`, as
 *  a non-HTTP response, and once as another server's HTML — a wrong ANSWER, not a timeout (#1729).
 *  Nothing here needs a port: the subject is what the handler writes. */
async function get(url: string): Promise<{ status: number; body: unknown }> {
  const { mountSharedAppPreviewRoutes } = await import("../../../server/backends/sharedAppPreviewRoutes.js");
  const server = express();
  mountSharedAppPreviewRoutes(server);
  const res = await appRequest(server)(url);
  return { status: res.status, body: await res.json() };
}

describe("shared app preview routes", () => {
  beforeAll(() => {
    app = express();
  });

  beforeEach(() => {
    preview.mockReset();
    root = makeTempDir("mt-preview-routes-");
  });

  it("says a directory with no app.json is not an app, rather than 404", async () => {
    const declared = await get(`/api/shared-app/declared?cwd=${encodeURIComponent(root)}`);

    expect(declared.status).toBe(200);
    expect(declared.body).toEqual({ declared: false });
    // And it costs nothing: the projection is never asked for.
    expect(preview).not.toHaveBeenCalled();
  });

  it("does not compute a projection to answer the probe", async () => {
    writeFileSync(path.join(root, "app.json"), JSON.stringify({ aid: "a", name: "n" }));

    const declared = await get(`/api/shared-app/declared?cwd=${encodeURIComponent(root)}`);

    expect(declared.body).toEqual({ declared: true });
    // The reason the probe is its own route: the pane asks it for every directory a cell opens.
    expect(preview).not.toHaveBeenCalled();
  });

  it("answers the preview for a directory with no app without opening a session", async () => {
    const result = await get(`/api/shared-app/preview?cwd=${encodeURIComponent(root)}`);

    expect(result.status).toBe(200);
    expect(result.body).toEqual({ declared: false });
    expect(preview).not.toHaveBeenCalled();
  });

  it("carries a refused declaration back as an ANSWER, not as a failure", async () => {
    writeFileSync(path.join(root, "app.json"), JSON.stringify({ aid: "a", name: "n" }));
    preview.mockResolvedValue({ ok: false, partial: false, problems: ["public.view.path names no file"] });

    const result = await get(`/api/shared-app/preview?cwd=${encodeURIComponent(root)}`);

    // 200, because the author asked what publishing would do and this IS the answer. The pane's
    // whole job is to put these lines in front of them, and it cannot do that from a status code.
    expect(result.status).toBe(200);
    expect(result.body).toEqual({ declared: true, ok: false, problems: ["public.view.path names no file"] });
  });

  it("hands the payload through untouched when there is one", async () => {
    writeFileSync(path.join(root, "app.json"), JSON.stringify({ aid: "a", name: "n" }));
    const wire = {
      aid: "a",
      submit: { bookings: { createFields: ["slot"] } },
      pages: [],
      publicOpen: true,
      fromLiveApp: false,
      generatedForm: false,
      datasets: { "public:public": { bookings: [] } },
      unreadable: [],
      warnings: [],
    };
    // The backend also carries the full published projection and the generated form's inputs.
    preview.mockResolvedValue({ ok: true, config: { read: ["bookings"], enabled: true }, form: { bookings: {} }, ...wire });
    // `submit` is NOT one of the fields held back. The parent in the browser judges every
    // submission against it, and an empty map there refuses everything as `unknown-collection`.

    const result = await get(`/api/shared-app/preview?cwd=${encodeURIComponent(root)}`);

    // Named field by field, so neither of those reaches the browser for nobody to read.
    expect(result.body).toEqual({ declared: true, ok: true, preview: wire });
    expect(preview).toHaveBeenCalledWith(root);
  });

  it("refuses a request that names no directory", async () => {
    const result = await get("/api/shared-app/preview");

    // The guard answered and the handler returned without touching the response.
    expect(preview).not.toHaveBeenCalled();
    expect(result.status).toBe(400);
  });

  it("mounts on an express app without touching anything else", async () => {
    const { mountSharedAppPreviewRoutes } = await import("../../../server/backends/sharedAppPreviewRoutes.js");
    expect(() => mountSharedAppPreviewRoutes(app)).not.toThrow();
  });
});
