// @vitest-environment node
import { describe, it, expect, beforeAll } from "vitest";
import { makeTempDir } from "../../test/support/tempDir.js";
import express, { type Express } from "express";
import { routeCall, jsonPost } from "../../test/helpers/routeCall.js";
import { isRecord } from "../../common/isRecord.js";
import fs from "node:fs";
import path from "node:path";
import { initArtifactsBackend } from "./artifacts.js";
import { initMulmoScriptBackend, mountMulmoScriptDispatchRoute, mountMulmoScriptMediaRoute } from "./mulmoscript.js";

const VALID_SCRIPT = { $mulmocast: { version: "1.1" }, title: "Test Story", beats: [{ text: "hello" }] };

function makeApp(): Express {
  const app = express();
  app.use(express.json({ limit: "25mb" }));
  mountMulmoScriptDispatchRoute(app);
  mountMulmoScriptMediaRoute(app);
  return app;
}

/** The `data` object a dispatch answers with, read through a guard rather than a cast: the body is
 *  JSON this spec has not otherwise checked, and every assertion below reads a named field off it. */
const dataOf = (body: Record<string, unknown>): Record<string, unknown> => {
  const data = body.data;
  if (!isRecord(data)) throw new Error(`the route answered no data: ${JSON.stringify(body)}`);
  return data;
};

/** The saved script's path, which the next request sends straight back.
 *
 *  Two shapes, deliberately kept apart: the TOOL-CALL route answers `{ data: { filePath } }` while
 *  the KIND router answers `filePath` at the top level. Reading one through the other's accessor
 *  throws on a body that is perfectly correct (CodeRabbit suggested exactly that on #1799). */
const asFilePath = (value: unknown, body: Record<string, unknown>): string => {
  if (typeof value !== "string") throw new Error(`no filePath in ${JSON.stringify(body)}`);
  return value;
};

const filePathOf = (body: Record<string, unknown>): string => asFilePath(dataOf(body).filePath, body);

describe("before init", () => {
  it("503s the dispatch and media routes", async () => {
    const app = makeApp();
    expect((await routeCall(app)("/api/plugin/presentMulmoScript", jsonPost({ script: VALID_SCRIPT }))).status).toBe(503);
    expect((await routeCall(app)("/api/mulmoscript/media?moviePath=stories/x.mp4")).status).toBe(503);
  });
});

describe("mulmoscript backend", () => {
  let app: Express;
  let workspace: string;

  beforeAll(() => {
    workspace = makeTempDir("mt-mulmoscript-");
    initArtifactsBackend({ workspace });
    initMulmoScriptBackend({ workspace, pubsub: null });
    app = makeApp();
  });

  it("tool-call (no kind) saves a new script and returns the ToolResult envelope", async () => {
    const res = await routeCall(app)("/api/plugin/presentMulmoScript", jsonPost({ script: VALID_SCRIPT, filename: "my-story" }));
    expect(res.status).toBe(200);
    expect(dataOf(res.body).filePath).toMatch(/^stories\/my-story-.*\.json$/);
    expect(res.body.message).toContain("Saved MulmoScript");
    expect(res.body.instructions).toContain("Display the storyboard");
    const onDisk = path.join(workspace, "artifacts", filePathOf(res.body));
    expect(JSON.parse(fs.readFileSync(onDisk, "utf8")).title).toBe("Test Story");
  });

  it("tool-call reopens an existing script", async () => {
    const saved = await routeCall(app)("/api/plugin/presentMulmoScript", jsonPost({ script: VALID_SCRIPT }));
    expect(saved.status).toBe(200);
    const res = await routeCall(app)("/api/plugin/presentMulmoScript", jsonPost({ filePath: filePathOf(saved.body) }));
    expect(res.status).toBe(200);
    const script = dataOf(res.body).script;
    expect(isRecord(script) && script.title).toBe("Test Story");
  });

  it("tool-call narrates a missing filePath as { message } (no thrown tool call)", async () => {
    const res = await routeCall(app)("/api/plugin/presentMulmoScript", jsonPost({ filePath: "stories/does-not-exist.json" }));
    expect(res.status).toBe(200);
    expect(res.body.data).toBeUndefined();
    expect(res.body.message).toContain("not found");
  });

  it("tool-call rejects traversal wire paths via the realpath guard", async () => {
    const res = await routeCall(app)("/api/plugin/presentMulmoScript", jsonPost({ filePath: "stories/../../../etc/passwd" }));
    expect(res.status).toBe(200);
    expect(res.body.data).toBeUndefined();
    expect(res.body.message).toBeTruthy();
  });

  it("dispatch (kind present) routes through the package kind router", async () => {
    const saveRes = await routeCall(app)("/api/plugin/presentMulmoScript", jsonPost({ kind: "save", script: VALID_SCRIPT }));
    expect(saveRes.status).toBe(200);
    expect(saveRes.body.ok).toBe(true);
    const filePath = asFilePath(saveRes.body.filePath, saveRes.body);

    const update = await routeCall(app)(
      "/api/plugin/presentMulmoScript",
      jsonPost({ kind: "updateScript", filePath, script: { ...VALID_SCRIPT, title: "Edited" } }),
    );
    expect(update.status).toBe(200);
    expect(update.body).toEqual({ ok: true });
    const onDisk = path.join(workspace, "artifacts", filePath);
    expect(JSON.parse(fs.readFileSync(onDisk, "utf8")).title).toBe("Edited");

    const pending = await routeCall(app)("/api/plugin/presentMulmoScript", jsonPost({ kind: "pendingGenerations", filePath }));
    expect(pending.status).toBe(200);
    expect(pending.body).toEqual({ ok: true, pending: [] });
  });

  it("dispatch answers unknown kinds as ok:false data (no HTTP error)", async () => {
    const res = await routeCall(app)("/api/plugin/presentMulmoScript", jsonPost({ kind: "nonsense" }));
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(false);
    expect(res.body.code).toBe("bad_request");
  });

  it("media route serves movie bytes for a contained wire path", async () => {
    const movieDir = path.join(workspace, "artifacts", "stories", "__movies__");
    fs.mkdirSync(movieDir, { recursive: true });
    fs.writeFileSync(path.join(movieDir, "clip.mp4"), "movie-bytes");
    const res = await routeCall(app)(`/api/mulmoscript/media?${new URLSearchParams({ moviePath: "stories/__movies__/clip.mp4" })}`);
    expect(res.status).toBe(200);
    expect(res.text).toBe("movie-bytes");
  });

  it("media route 400s without a path, 404s missing files, and rejects traversal", async () => {
    expect((await routeCall(app)("/api/mulmoscript/media")).status).toBe(400);
    expect((await routeCall(app)(`/api/mulmoscript/media?${new URLSearchParams({ moviePath: "stories/nope.mp4" })}`)).status).toBe(404);
    expect((await routeCall(app)(`/api/mulmoscript/media?${new URLSearchParams({ moviePath: "stories/../../../etc/passwd" })}`)).status).toBe(400);
    expect((await routeCall(app)(`/api/mulmoscript/media?${new URLSearchParams({ pdfPath: "/etc/passwd" })}`)).status).toBe(400);
  });
});

// Re-inits the module-level backend, so this describe must run AFTER the ones
// above (vitest runs describes in file order within a file).
describe("autoGenerateMovie without ffmpeg", () => {
  it("saves the script but reports that movie generation was not started", async () => {
    const workspace = makeTempDir("mt-mulmoscript-noffmpeg-");
    initArtifactsBackend({ workspace });
    initMulmoScriptBackend({ workspace, pubsub: null, isFfmpegAvailable: () => false });
    const app = makeApp();

    const res = await routeCall(app)("/api/plugin/presentMulmoScript", jsonPost({ script: VALID_SCRIPT, autoGenerateMovie: true }));
    expect(res.status).toBe(200);
    expect(dataOf(res.body).filePath).toMatch(/^stories\/.*\.json$/);
    expect(res.body.message).toContain("movie generation was NOT started");
    expect(res.body.message).toContain("ffmpeg");
    // The doomed background job must not have run: no error sidecar next to the script.
    const sidecar = path.join(workspace, "artifacts", `${filePathOf(res.body)}.error.txt`);
    expect(fs.existsSync(sidecar)).toBe(false);
  });
});
