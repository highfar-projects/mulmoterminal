// @vitest-environment node
import { describe, it, expect, vi, afterAll, afterEach } from "vitest";
import { chmodSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CLAUDE_DIST_TAGS_URL, fetchClaudeStable, fetchNodeReleases, readClaudeVersion, resolveCommandPath } from "../../bin/check-versions.js";

const stubFetch = (impl: (url: string) => Promise<unknown>) => vi.stubGlobal("fetch", vi.fn(impl));

describe("fetchClaudeStable", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("reads the stable dist-tag, not latest", async () => {
    stubFetch(async () => ({ ok: true, json: async () => ({ stable: "2.1.277", latest: "2.1.284" }) }));
    expect(await fetchClaudeStable()).toBe("2.1.277");
  });

  it("asks the dist-tags endpoint of the Claude Code package", async () => {
    stubFetch(async () => ({ ok: true, json: async () => ({}) }));
    await fetchClaudeStable();
    expect(vi.mocked(fetch).mock.calls[0]?.[0]).toBe(CLAUDE_DIST_TAGS_URL);
    expect(CLAUDE_DIST_TAGS_URL).toMatch(/\/-\/package\/@anthropic-ai\/claude-code\/dist-tags$/);
  });

  it.each([
    ["a non-OK response", async () => ({ ok: false, json: async () => ({ stable: "2.1.277" }) })],
    ["no stable tag", async () => ({ ok: true, json: async () => ({ latest: "2.1.284" }) })],
    ["a non-string stable tag", async () => ({ ok: true, json: async () => ({ stable: 2 }) })],
    ["a null body", async () => ({ ok: true, json: async () => null })],
    ["an unparsable body", async () => ({ ok: true, json: async () => Promise.reject(new SyntaxError("bad json")) })],
    [
      "a rejected fetch",
      async () => {
        throw new Error("offline");
      },
    ],
  ])("is null for %s", async (_label, impl) => {
    stubFetch(impl);
    expect(await fetchClaudeStable()).toBeNull();
  });
});

describe("fetchNodeReleases", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("returns the payload as-is for the pure side to validate", async () => {
    const releases = [{ version: "v24.21.0", lts: "Krypton" }];
    stubFetch(async () => ({ ok: true, json: async () => releases }));
    expect(await fetchNodeReleases()).toEqual(releases);
  });

  it("is null when offline", async () => {
    stubFetch(async () => {
      throw new Error("offline");
    });
    expect(await fetchNodeReleases()).toBeNull();
  });
});

describe.skipIf(process.platform === "win32")("resolveCommandPath and readClaudeVersion", () => {
  const dir = mkdtempSync(join(tmpdir(), "check-versions-"));
  const fake = join(dir, "real-claude");
  writeFileSync(fake, "#!/bin/sh\necho '2.1.284 (Claude Code)'\n");
  chmodSync(fake, 0o755);
  symlinkSync(fake, join(dir, "claude"));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it("finds the command on PATH and follows its symlink", () => {
    expect(resolveCommandPath("claude", { PATH: `/nonexistent:${dir}` })).toBe(resolveCommandPath(fake, {}));
  });

  it("skips a non-executable file that shadows the real one earlier on PATH", () => {
    const shadowDir = mkdtempSync(join(tmpdir(), "check-versions-shadow-"));
    writeFileSync(join(shadowDir, "claude"), "not a program\n");
    chmodSync(join(shadowDir, "claude"), 0o644);
    expect(resolveCommandPath("claude", { PATH: `${shadowDir}:${dir}` })).toBe(resolveCommandPath(fake, {}));
    rmSync(shadowDir, { recursive: true, force: true });
  });

  it("is null when nothing on PATH matches", () => {
    expect(resolveCommandPath("claude", { PATH: "/nonexistent" })).toBeNull();
    expect(resolveCommandPath("claude", {})).toBeNull();
  });

  it("takes a path as itself", () => {
    expect(resolveCommandPath(join(dir, "missing"), { PATH: dir })).toBeNull();
    expect(resolveCommandPath(join(dir, "claude"), {})).not.toBeNull();
  });

  it("reads the version the binary prints, and null when it cannot run", async () => {
    expect(await readClaudeVersion(fake)).toBe("2.1.284");
    expect(await readClaudeVersion(join(dir, "missing"))).toBeNull();
  });

  it("gives up on a binary that ignores SIGTERM instead of holding init", async () => {
    const stuck = join(dir, "stuck-claude");
    // A shell `sleep` still dies on SIGTERM, so the stubborn child is node with the signal ignored.
    writeFileSync(stuck, `#!${process.execPath}\nprocess.on("SIGTERM", () => {});\nsetTimeout(() => {}, 30_000);\n`);
    chmodSync(stuck, 0o755);
    const started_ms = Date.now();
    expect(await readClaudeVersion(stuck, 300)).toBeNull();
    expect(Date.now() - started_ms).toBeLessThan(5000);
  });
});

// The whole point of routing the check through `init`: a normal launch must not load it.
describe("the launcher", () => {
  const launcher = readFileSync(new URL("../../bin/mulmoterminal.js", import.meta.url), "utf8");

  it("has no static import of the version check", () => {
    expect(launcher).not.toMatch(/^import[^;]*["']\.\/check-versions\.js["']/m);
  });

  it("loads it dynamically from runInit", () => {
    const runInit = launcher.slice(launcher.indexOf("async function runInit("));
    expect(runInit.slice(0, runInit.indexOf("\n}\n"))).toContain('await import("./check-versions.js")');
  });
});
