// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import express, { type Express } from "express";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, symlinkSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { initArtifactsBackend } from "../../../server/backends/artifacts";
import { initMulmoScriptBackend, mountMulmoScriptDispatchRoute } from "../../../server/backends/mulmoscript";
import { registeredStoriesRoot } from "../../../server/backends/mulmoscript";
import { routeCall, jsonPost } from "../../helpers/routeCall";

// The browser decides whether to OFFER the Canvas from a LEXICAL prefix test — it cannot realpath.
// The named root is the directory this server resolved at boot. Retarget the workspace symlink and
// the file tree lists the new directory while the plugin still serves the old one, so one wire path
// names two different files. Opening the other one silently is the failure this check exists for
// (Codex P1 iter-6 on #1934).
const DECK = JSON.stringify({ $mulmocast: { version: "1.1" }, title: "Deck", beats: [{ text: "one" }] });

describe("the wire path must still name the file the browser saw", () => {
  let base = "";
  let app: Express;

  beforeEach(() => {
    base = mkdtempSync(path.join(tmpdir(), "mt-expectpath-"));
    const first = path.join(base, "first");
    const link = path.join(base, "ws");
    mkdirSync(path.join(first, "decks"), { recursive: true });
    writeFileSync(path.join(first, "decks", "talk.json"), DECK);
    symlinkSync(first, link);
    initArtifactsBackend({ workspace: link });
    initMulmoScriptBackend({ workspace: link, pubsub: null });
    app = express();
    app.use(express.json({ limit: "25mb" }));
    mountMulmoScriptDispatchRoute(app);
  });

  afterEach(() => rmSync(base, { recursive: true, force: true }));

  it("opens the deck when the two agree", async () => {
    const root = registeredStoriesRoot();
    const res = await routeCall(app)(
      "/api/plugin/presentMulmoScript",
      jsonPost({ kind: "save", filePath: "stories/decks/talk.json", root: root?.id, expectPath: path.join(base, "ws", "decks", "talk.json") }),
    );
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  // The retarget: the pane now lists SECOND's file, the plugin still serves FIRST's. Same relative
  // path, different file — and the old behaviour was to hand back the one nobody asked for.
  it("refuses when the workspace moved under the same relative path", async () => {
    const second = path.join(base, "second");
    mkdirSync(path.join(second, "decks"), { recursive: true });
    writeFileSync(path.join(second, "decks", "talk.json"), DECK.replace("Deck", "A DIFFERENT DECK"));
    unlinkSync(path.join(base, "ws"));
    symlinkSync(second, path.join(base, "ws"));

    const root = registeredStoriesRoot();
    const res = await routeCall(app)(
      "/api/plugin/presentMulmoScript",
      jsonPost({ kind: "save", filePath: "stories/decks/talk.json", root: root?.id, expectPath: path.join(base, "ws", "decks", "talk.json") }),
    );
    expect(res.status).toBe(400);
    expect(String(res.body.error)).toMatch(/not the file this server serves/);
  });

  // The agent's own tool call sends no `expectPath`, and must keep working exactly as it did.
  it("leaves a request without expectPath alone", async () => {
    const res = await routeCall(app)(
      "/api/plugin/presentMulmoScript",
      jsonPost({ kind: "save", filePath: "stories/decks/talk.json", root: registeredStoriesRoot()?.id }),
    );
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });
});
