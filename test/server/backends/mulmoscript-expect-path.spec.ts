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

  // The handoff this check DEPENDS on: a path that does not resolve is left to the dispatch, which
  // names the id it could not find. Without this, `wirePathMismatch` could go back to answering
  // first and the browser would show the generic fallback instead — and only a client test that
  // MOCKS the good shape would notice, i.e. nothing would (Codex on #1942).
  it("lets the dispatch name the root it does not know", async () => {
    const res = await routeCall(app)(
      "/api/plugin/presentMulmoScript",
      jsonPost({ kind: "save", filePath: "stories/decks/talk.json", root: "never-registered", expectPath: path.join(base, "ws", "decks", "talk.json") }),
    );
    // 200, NOT the 400 the mismatch above answers with — measured, and Codex asked for 400 on the
    // assumption the two refusals match. They do not, and the difference decides which branch of
    // the client runs: an unknown root never reaches `!res.ok`, so the only thing that carries this
    // sentence to the pane is the rule that a non-card 200 is refused rather than dropped (#1941).
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(false);
    expect(String(res.body.error)).toContain('unknown stories root "never-registered"');
    // NOT this check's own sentence: it must not answer for a root nothing registered.
    expect(String(res.body.error)).not.toMatch(/not the file this server serves/);
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
