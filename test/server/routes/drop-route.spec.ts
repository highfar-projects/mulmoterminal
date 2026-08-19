// @vitest-environment node
// The POST /api/session/:id/drop contract, pinned at the route. The body is RAW bytes under the
// dropped file's own content type, and the only path in the answer is one the server chose — the
// request carries none, which is what leaves nothing to sanitize.
import { describe, it, expect, afterEach, afterAll } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import path from "node:path";
import os from "node:os";
import express from "express";
import { routeCall } from "../../helpers/routeCall";
import { mountDropRoutes } from "../../../server/routes/drop-routes";
import { cleanupSessionDrops } from "../../../server/session/session-drops";
import { ptys } from "../../../server/session/registry";

const app = express();
mountDropRoutes(app);

const LIVE = randomUUID();
const NOT_RUNNING = randomUUID();

// A pty entry with just the fields this route reads — which is only its presence in the map
// (same stand-in as test/server/session/lifecycle.spec.ts).
ptys.set(LIVE, { term: { kill: () => undefined }, ws: null, buffer: "", cwd: os.tmpdir(), active: false, agent: "claude" } as never);

const call = routeCall(app);

/** The path the route answers with. A guard rather than a cast: the body is JSON this spec has not
 *  otherwise checked, and every assertion below feeds this value to `path` or `fs`. */
const savedPath = (body: Record<string, unknown>): string => {
  const value = body.path;
  if (typeof value !== "string") throw new Error(`the route answered no path: ${JSON.stringify(body)}`);
  return value;
};

/** A drop is a RAW upload: the bytes ARE the body and the name travels in a header, so this takes
 *  both rather than a JSON payload. `dropName` is left unencoded for the one test that sends a
 *  malformed escape on purpose. */
const post = (id: string, contentType: string, bytes: Buffer, dropName?: string) =>
  call(`/api/session/${id}/drop`, {
    method: "POST",
    headers: { "content-type": contentType, ...(dropName === undefined ? {} : { "x-drop-filename": dropName }) },
    body: bytes,
  });

afterEach(() => cleanupSessionDrops(LIVE));
afterAll(() => ptys.delete(LIVE));

describe("POST /api/session/:id/drop", () => {
  it("saves the bytes and answers with a path inside the session's own directory", async () => {
    const res = await post(LIVE, "text/plain", Buffer.from("hello"), encodeURIComponent("notes.md"));
    expect(res.status).toBe(200);
    expect(path.basename(path.dirname(savedPath(res.body)))).toBe(LIVE);
    expect(savedPath(res.body).endsWith(".md")).toBe(true);
    expect(readFileSync(savedPath(res.body), "utf8")).toBe("hello");
  });

  // An empty file is a real file. Refusing it would mean the same drop succeeds in a browser that
  // exposes the path and fails in one that does not — the browser-dependent behaviour this route
  // exists to remove (found by Codex review).
  it("accepts a zero-byte file", async () => {
    const res = await post(LIVE, "text/plain", Buffer.alloc(0), encodeURIComponent("empty.txt"));
    expect(res.status).toBe(200);
    expect(existsSync(savedPath(res.body))).toBe(true);
    expect(readFileSync(savedPath(res.body), "utf8")).toBe("");
  });

  // Headers are latin-1 and real filenames are not, so the sender percent-encodes. A name that
  // arrives undecodable simply is not known — the extension then comes from the content type.
  it("takes the extension from a percent-encoded non-ASCII filename", async () => {
    const res = await post(LIVE, "application/octet-stream", Buffer.from("x"), encodeURIComponent("メモ.ts"));
    expect(savedPath(res.body).endsWith(".ts")).toBe(true);
    expect(savedPath(res.body)).not.toContain("メモ");
  });

  it("falls back to the content type when the filename header is malformed", async () => {
    const res = await post(LIVE, "image/png", Buffer.from("x"), "%E0%A4%A");
    expect(res.status).toBe(200);
    expect(savedPath(res.body).endsWith(".png")).toBe(true);
  });

  // The request names no path, so a filename that tried to steer one must leave no trace.
  it("never lets the filename reshape the saved path", async () => {
    const res = await post(LIVE, "text/plain", Buffer.from("x"), encodeURIComponent("../../../etc/passwd"));
    expect(res.status).toBe(200);
    expect(savedPath(res.body)).not.toContain("passwd");
    expect(path.basename(path.dirname(savedPath(res.body)))).toBe(LIVE);
  });

  it("refuses an id that is not a session id", async () => {
    const res = await post("not-a-uuid", "text/plain", Buffer.from("x"));
    expect(res.status).toBe(400);
  });

  // Granting the directory happens at spawn, so a session this server is not running has nowhere
  // the file could be read from even if it were saved.
  it("refuses a session this server is not running", async () => {
    const res = await post(NOT_RUNNING, "text/plain", Buffer.from("x"));
    expect(res.status).toBe(404);
  });
});
