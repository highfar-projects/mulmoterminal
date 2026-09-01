// @vitest-environment node
import { describe, it, expect } from "vitest";
import { mkdtempSync, mkdirSync, symlinkSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { storiesRootId } from "../../../server/backends/storiesRoot";

// The id names the WORKSPACE SUBTREE to the mulmoScript plugin, and it is persisted in the Canvas
// cards a browser stores (#1933). Everything here is about that persistence: an id that keeps
// matching after the workspace moved would open a card against a DIFFERENT subtree, silently.
describe("storiesRootId", () => {
  it("is stable for the same directory", () => {
    expect(storiesRootId("/work/ws")).toBe(storiesRootId("/work/ws"));
  });

  // The reason it is derived rather than a label like `workspace`: restart somewhere else and the
  // id changes, so an old card names a root this server never registered — which the plugin
  // refuses (receptron/mulmoclaude#3015) instead of reading the wrong file.
  it("differs for a different directory", () => {
    expect(storiesRootId("/work/ws")).not.toBe(storiesRootId("/work/other"));
  });

  it("ignores a trailing separator and a relative step", () => {
    expect(storiesRootId("/work/ws/")).toBe(storiesRootId("/work/ws"));
    expect(storiesRootId("/work/ws/inner/..")).toBe(storiesRootId("/work/ws"));
  });

  // Canonical, like every other path this app compares: the same directory reached through a
  // symlink is the same root, or a card made under one spelling would not open under the other.
  it("answers the same for a symlinked spelling of one directory", () => {
    const base = mkdtempSync(path.join(tmpdir(), "mt-stories-root-"));
    try {
      const real = path.join(base, "real");
      const link = path.join(base, "link");
      mkdirSync(real);
      symlinkSync(real, link);
      expect(storiesRootId(link)).toBe(storiesRootId(real));
    } finally {
      rmSync(base, { recursive: true, force: true });
    }
  });

  it("is short enough to read on a card, and hex", () => {
    expect(storiesRootId("/work/ws")).toMatch(/^[0-9a-f]{16}$/);
  });
});
