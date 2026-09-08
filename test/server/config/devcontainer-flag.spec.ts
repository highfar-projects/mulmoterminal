// @vitest-environment node
//
// Only the pure file-I/O half of devcontainer-flag.ts: markDevcontainerEnabled/Disabled and
// hasDevcontainerConfig. runDevcontainerUp/stopDevcontainer/runningDevcontainerName shell out to
// the real `devcontainer`/`docker` CLIs and are verified live against a real container instead —
// mocking child_process would only prove the mock, not that a real `docker stop` actually stops.
import { describe, it, expect } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { hasDevcontainerConfig, markDevcontainerEnabled, markDevcontainerDisabled } from "../../../server/config/devcontainer-flag.js";

const tmp = () => mkdtempSync(path.join(tmpdir(), "mt-devcontainer-flag-"));
const readLocal = (dir: string) => JSON.parse(readFileSync(path.join(dir, ".mulmoterminal.local.json"), "utf8"));

describe("hasDevcontainerConfig", () => {
  it("is false for a directory with neither file", () => {
    const dir = tmp();
    try {
      expect(hasDevcontainerConfig(dir)).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("is true for .devcontainer/devcontainer.json", () => {
    const dir = tmp();
    try {
      mkdirSync(path.join(dir, ".devcontainer"));
      writeFileSync(path.join(dir, ".devcontainer", "devcontainer.json"), "{}");
      expect(hasDevcontainerConfig(dir)).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("is true for the flat .devcontainer.json form", () => {
    const dir = tmp();
    try {
      writeFileSync(path.join(dir, ".devcontainer.json"), "{}");
      expect(hasDevcontainerConfig(dir)).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("markDevcontainerEnabled / markDevcontainerDisabled", () => {
  it("writes devcontainer:true, with the workspace folder omitted when it matches dir", () => {
    const dir = tmp();
    try {
      markDevcontainerEnabled(dir, dir);
      expect(readLocal(dir)).toEqual({ devcontainer: true, devcontainerWorkspaceFolder: null });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("records the workspace folder when it differs from dir", () => {
    const dir = tmp();
    try {
      markDevcontainerEnabled(dir, "/workspaces/repo");
      expect(readLocal(dir)).toEqual({ devcontainer: true, devcontainerWorkspaceFolder: "/workspaces/repo" });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("preserves other keys already in the local config file", () => {
    const dir = tmp();
    try {
      writeFileSync(path.join(dir, ".mulmoterminal.local.json"), JSON.stringify({ badgeColor: "blue" }));
      markDevcontainerEnabled(dir, dir);
      expect(readLocal(dir)).toEqual({ badgeColor: "blue", devcontainer: true, devcontainerWorkspaceFolder: null });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  // The way back: the directory's own flag flips to false explicitly (not deleted), so a later
  // read of `enabled` — offerDevcontainerIfNeeded's own check — sees the same "not enabled" it
  // would for a directory that was never asked, and offers to build again.
  it("flips an enabled directory back to disabled, clearing the workspace folder", () => {
    const dir = tmp();
    try {
      markDevcontainerEnabled(dir, "/workspaces/repo");
      markDevcontainerDisabled(dir);
      expect(readLocal(dir)).toEqual({ devcontainer: false, devcontainerWorkspaceFolder: null });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("preserves other keys when disabling", () => {
    const dir = tmp();
    try {
      writeFileSync(path.join(dir, ".mulmoterminal.local.json"), JSON.stringify({ devcontainer: true, badgeColor: "blue" }));
      markDevcontainerDisabled(dir);
      expect(readLocal(dir)).toEqual({ devcontainer: false, devcontainerWorkspaceFolder: null, badgeColor: "blue" });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("does nothing destructive when disabling a directory with no local config file yet", () => {
    const dir = tmp();
    try {
      markDevcontainerDisabled(dir);
      expect(readLocal(dir)).toEqual({ devcontainer: false, devcontainerWorkspaceFolder: null });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
