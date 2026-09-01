// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, symlinkSync, rmSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { initMulmoScriptBackend, registeredStoriesRoot } from "../../../server/backends/mulmoscript";
import { initArtifactsBackend } from "../../../server/backends/artifacts";
import { storiesRootId } from "../../../server/backends/storiesRoot";

// What `/api/config` hands the browser about the named stories root. It must be the value the
// plugin was REGISTERED with: a card carries the id, and an id nothing registered is a
// `bad_request` on every open (CodeRabbit on #1934).
describe("the registered stories root", () => {
  let base = "";

  beforeEach(() => {
    base = mkdtempSync(path.join(tmpdir(), "mt-stories-registered-"));
  });

  afterEach(() => rmSync(base, { recursive: true, force: true }));

  it("is the canonical workspace and its id", () => {
    const real = path.join(base, "real-ws");
    mkdirSync(real);
    initArtifactsBackend({ workspace: real });
    initMulmoScriptBackend({ workspace: real, pubsub: null });
    expect(registeredStoriesRoot()).toEqual({ id: storiesRootId(real), path: expect.stringContaining("real-ws") });
  });

  // The reason it is captured rather than recomputed: `storiesRootId` realpaths, so a workspace
  // reached through a symlink answers with the TARGET — and retargeting that symlink while the
  // server runs would otherwise change the id the browser is handed, while the plugin keeps
  // serving the one it registered at boot.
  it("does not follow a symlink retargeted after boot", () => {
    const first = path.join(base, "first");
    const second = path.join(base, "second");
    const link = path.join(base, "ws");
    mkdirSync(first);
    mkdirSync(second);
    symlinkSync(first, link);
    initArtifactsBackend({ workspace: link });
    initMulmoScriptBackend({ workspace: link, pubsub: null });
    const atBoot = registeredStoriesRoot();

    unlinkSync(link);
    symlinkSync(second, link);

    expect(registeredStoriesRoot()).toEqual(atBoot);
    expect(atBoot?.id).not.toBe(storiesRootId(link)); // what re-deriving would now answer
  });
});
