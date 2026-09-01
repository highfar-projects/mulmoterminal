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
    const root = registeredStoriesRoot();
    expect(root?.id).toBe(storiesRootId(real));
    // Every spelling names the same directory. On macOS even a plain temp path has two — `/var` is
    // itself a symlink to `/private/var` — which is exactly why the browser is handed the set.
    expect(root?.paths.length).toBeGreaterThan(0);
    expect(root?.paths.every((p) => p.endsWith("real-ws"))).toBe(true);
    expect(new Set(root?.paths).size).toBe(root?.paths.length); // deduped
  });

  // The reason it is captured rather than recomputed: `storiesRootId` realpaths, so a workspace
  // reached through a symlink answers with the TARGET — and retargeting that symlink while the
  // server runs would otherwise change the id the browser is handed, while the plugin keeps
  // serving the one it registered at boot.
  // Both spellings, because both reach the Files pane and the browser's check is lexical: the
  // launched one through a cell's cwd, the resolved one through `git worktree list` (#1934 iter-5).
  it("carries the launched spelling as well as the resolved one", () => {
    const real = path.join(base, "real-ws");
    const link = path.join(base, "ws-link");
    mkdirSync(real);
    symlinkSync(real, link);
    initArtifactsBackend({ workspace: link });
    initMulmoScriptBackend({ workspace: link, pubsub: null });
    const root = registeredStoriesRoot();
    expect(root?.paths).toContain(link);
    expect(root?.paths.some((p) => p.includes("real-ws") && !p.includes("ws-link"))).toBe(true);
  });

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
