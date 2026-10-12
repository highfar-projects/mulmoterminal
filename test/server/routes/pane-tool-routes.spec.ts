// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import express from "express";
import { mkdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { makeTempDir } from "../../support/tempDir.js";
import { routeCall, jsonPost } from "../../helpers/routeCall";

// #3022. The session a command is FOR comes from the broker's header, and the directory its paths are
// contained in comes from that session — both stubbed here to one temporary directory.
const cwd = vi.hoisted(() => ({ dir: "" }));
vi.mock("../../../server/session/session-cwd.js", () => ({ cwdForSessionHydrated: async () => cwd.dir }));

const { mountPaneToolRoutes } = await import("../../../server/routes/pane-tool-routes");

const HEADER = { "x-mulmoterminal-session": "11111111-2222-4333-8444-555555555555" };

describe("pane tool routes", () => {
  let root: string;
  let published: { channel: string; data: unknown }[];
  let call: ReturnType<typeof routeCall>;

  beforeEach(() => {
    root = makeTempDir("mt-pane-");
    mkdirSync(path.join(root, "proj", "docs"), { recursive: true });
    writeFileSync(path.join(root, "proj", "docs", "a.md"), "# a");
    writeFileSync(path.join(root, "secret.txt"), "x");
    cwd.dir = path.join(root, "proj");
    published = [];
    const app = express();
    app.use(express.json());
    mountPaneToolRoutes(app, { publish: (channel, data) => published.push({ channel, data }) });
    call = routeCall(app);
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it("publishes a show for the calling session, the path relative to its directory", async () => {
    const res = await call("/api/plugin/showInPane", jsonPost({ path: "docs/a.md", view: "canvas" }, HEADER));
    expect(res.body.message).toBe("Shown docs/a.md (canvas) in your pane.");
    expect(published).toEqual([
      { channel: "pane-command", data: { kind: "show", sessionId: "11111111-2222-4333-8444-555555555555", cwd: cwd.dir, path: "docs/a.md", view: "canvas" } },
    ]);
  });

  it("takes an absolute path inside the directory, and a line", async () => {
    await call("/api/plugin/showInPane", jsonPost({ path: path.join(cwd.dir, "docs", "a.md"), line: 3 }, HEADER));
    expect(published[0]?.data).toMatchObject({ path: "docs/a.md", view: "editor", line: 3 });
  });

  // A directory reached through a symlink (`/tmp` on macOS is one): the containment answers with the
  // REAL path, and the relative path must still be the one the pane will open.
  it("keeps the relative path right when the directory is reached through a symlink", async () => {
    const link = path.join(root, "link");
    symlinkSync(cwd.dir, link);
    cwd.dir = link;
    await call("/api/plugin/showInPane", jsonPost({ path: "docs/a.md" }, HEADER));
    expect(published[0]?.data).toMatchObject({ path: "docs/a.md", cwd: link });
  });

  it.each([["../secret.txt"], ["/etc/hosts"], ["docs/../../secret.txt"]])("refuses %s, outside the directory, and publishes nothing", async (outside) => {
    const res = await call("/api/plugin/showInPane", jsonPost({ path: outside }, HEADER));
    expect(res.body.message).toMatch(/is not inside your working directory/);
    expect(published).toEqual([]);
  });

  it("refuses a call with no session, and bad arguments", async () => {
    expect((await call("/api/plugin/showInPane", jsonPost({ path: "docs/a.md" }))).body.message).toMatch(/only from a MulmoTerminal terminal/);
    expect((await call("/api/plugin/showInPane", jsonPost({ path: "docs/a.md", view: "window" }, HEADER))).body.message).toMatch(/needs a `path`/);
    expect(published).toEqual([]);
  });

  it("publishes a check, keeps it for a reload, and drops it only when that check is closed", async () => {
    const res = await call(
      "/api/plugin/requestCheck",
      jsonPost({ title: "Maths", items: [{ label: "Drawn", path: "docs/a.md", view: "preview" }, { label: "Looks right" }] }, HEADER),
    );
    expect(res.body.message).toMatch(/^Showed 2 item\(s\) to the user in your pane\./);
    const check = published[0]?.data;
    expect(check).toMatchObject({
      kind: "check",
      sessionId: "11111111-2222-4333-8444-555555555555",
      title: "Maths",
      items: [{ label: "Drawn", target: { path: "docs/a.md", view: "preview" } }, { label: "Looks right" }],
    });
    const id = (check as { id: string }).id;
    expect((await call("/api/pane/check/11111111-2222-4333-8444-555555555555")).body.check).toMatchObject({ id });
    await call("/api/pane/check/11111111-2222-4333-8444-555555555555/close", jsonPost({ id: "another" }));
    expect((await call("/api/pane/check/11111111-2222-4333-8444-555555555555")).body.check).toMatchObject({ id });
    await call("/api/pane/check/11111111-2222-4333-8444-555555555555/close", jsonPost({ id }));
    expect((await call("/api/pane/check/11111111-2222-4333-8444-555555555555")).body.check).toBeNull();
  });

  it("answers 400 for a session id that is not one", async () => {
    expect((await call("/api/pane/check/not-a-session")).status).toBe(400);
    expect((await call("/api/pane/check/not-a-session/close", jsonPost({ id: "x" }))).status).toBe(400);
  });

  it("refuses a whole check when one item points outside the directory", async () => {
    const res = await call("/api/plugin/requestCheck", jsonPost({ title: "T", items: [{ label: "ok" }, { label: "bad", path: "../secret.txt" }] }, HEADER));
    expect(res.body.message).toMatch(/is not inside your working directory/);
    expect(published).toEqual([]);
  });
});
