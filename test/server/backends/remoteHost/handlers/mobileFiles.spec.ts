// @vitest-environment node
import { afterEach, describe, it, expect } from "vitest";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { REMOTE_VIEW_MAX_BYTES } from "@mulmoclaude/core/remote-view";
import { makeTempDir } from "../../../../support/tempDir.js";
import { createMobileFileHandlers } from "../../../../../server/backends/remoteHost/handlers/mobileFiles";
import type { MobileFileStager } from "../../../../../server/backends/remoteHost/mobileFileStaging";
import { initProjectRoots, projectId, resetProjectRootsForTesting } from "../../../../../server/infra/fs/project-root";

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47]);

function setup(config: unknown) {
  const root = makeTempDir("mt-mobile-handlers-");
  if (config !== undefined) writeFileSync(path.join(root, ".mulmoterminal.json"), JSON.stringify({ mobileFiles: config }));
  mkdirSync(path.join(root, "output", "img"), { recursive: true });
  const staged: { path: string; contentType: string; bytes: number }[] = [];
  const stager: MobileFileStager = {
    stage: async (key, read, contentType) => {
      staged.push({ path: key.absolutePath, contentType, bytes: (await read()).length });
      return { storagePath: `downloads/u/id-${staged.length}`, expiresAtMs: Date.UTC(2026, 0, 1) };
    },
    sweepExpired: async () => undefined,
  };
  const handlers = createMobileFileHandlers({ workspace: root, stager });
  const write = (rel: string, body: string | Buffer) => writeFileSync(path.join(root, rel), body);
  return { root, handlers, staged, write };
}

const call = async (handlers: ReturnType<typeof setup>["handlers"], name: string, params: Record<string, unknown> = {}) => {
  const handler = handlers[name];
  if (!handler) throw new Error(`no handler ${name}`);
  return handler(JSON.parse(JSON.stringify(params)));
};

afterEach(() => resetProjectRootsForTesting());

describe("listMobileFiles", () => {
  it("says the project is not configured when it declares nothing", async () => {
    const { handlers, write } = setup(undefined);
    write("output/a.md", "# a");
    expect(await call(handlers, "listMobileFiles")).toMatchObject({ configured: false, files: [], total: 0 });
  });

  it("pages the declared files", async () => {
    const { handlers, write } = setup({ dirs: ["output"], extensions: ["md"] });
    write("output/a.md", "a");
    write("output/b.md", "b");
    write("output/c.pdf", "c");
    const page = await call(handlers, "listMobileFiles", { offset: 1, limit: 1 });
    expect(page).toMatchObject({ configured: true, total: 2, offset: 1, limit: 1, truncated: false });
  });

  it("treats a declaration pointing outside the project as no declaration", async () => {
    const { handlers } = setup({ dirs: ["../"], extensions: ["md"] });
    expect(await call(handlers, "listMobileFiles")).toMatchObject({ configured: false });
  });
});

describe("getMobileFile", () => {
  it("refuses when the project declares nothing", async () => {
    const { handlers, write } = setup(undefined);
    write("output/a.md", "# a");
    await expect(call(handlers, "getMobileFile", { path: "output/a.md" })).rejects.toThrow(/does not share/);
  });

  it.each([["notes.md"], ["output/a.pdf"], ["output/../notes.md"], [""]])("refuses %j", async (requested) => {
    const { handlers, write } = setup({ dirs: ["output"], extensions: ["md"] });
    write("notes.md", "secret");
    write("output/a.pdf", "x");
    await expect(call(handlers, "getMobileFile", { path: requested })).rejects.toThrow(/not one this project shares/);
  });

  it("sends a small markdown inline with its declared images embedded", async () => {
    const { handlers, write } = setup({ dirs: ["output"], extensions: ["md", "png"] });
    write("output/img/a.png", PNG);
    write("output/a.md", "![a](img/a.png) ![b](../outside.png)");
    write("outside.png", PNG);
    const result = await call(handlers, "getMobileFile", { path: "output/a.md" });
    expect(result).toMatchObject({ delivery: "inline", kind: "markdown", path: "output/a.md", omittedImages: 1 });
    expect(JSON.stringify(result)).toContain(`data:image/png;base64,${PNG.toString("base64")}`);
  });

  it("embeds a declared directory's image even when the project shares no png files directly", async () => {
    const { handlers, write } = setup({ dirs: ["output"], extensions: ["html"] });
    write("output/img/a.png", PNG);
    write("output/a.html", '<img src="img/a.png">');
    const result = await call(handlers, "getMobileFile", { path: "output/a.html" });
    expect(result).toMatchObject({ delivery: "inline", kind: "html", omittedImages: 0 });
  });

  it("wraps html in its CSP", async () => {
    const { handlers, write } = setup({ dirs: ["output"], extensions: ["html"] });
    write("output/a.html", "<p>hi</p>");
    const result = await call(handlers, "getMobileFile", { path: "output/a.html" });
    expect(JSON.stringify(result)).toContain("connect-src 'none'");
  });

  it("stages a binary file instead of sending it inline", async () => {
    const { handlers, write, staged } = setup({ dirs: ["output"], extensions: ["pdf"] });
    write("output/a.pdf", "%PDF");
    const result = await call(handlers, "getMobileFile", { path: "output/a.pdf" });
    expect(result).toMatchObject({ delivery: "storage", kind: "pdf", storagePath: "downloads/u/id-1", contentType: "application/pdf", bytes: 4 });
    expect(staged).toHaveLength(1);
  });

  it("stages a document too large for the command document, still wrapped", async () => {
    const { handlers, write, staged } = setup({ dirs: ["output"], extensions: ["html"] });
    write("output/big.html", `<p>${"x".repeat(REMOTE_VIEW_MAX_BYTES)}</p>`);
    const result = await call(handlers, "getMobileFile", { path: "output/big.html" });
    expect(result).toMatchObject({ delivery: "storage", kind: "html" });
    expect(staged[0]?.bytes).toBeGreaterThan(REMOTE_VIEW_MAX_BYTES);
  });
});

describe("listMobileFileProjects", () => {
  it("offers only the projects that declare files, without their paths", async () => {
    const shared = setup({ dirs: ["output"], extensions: ["md"] });
    const silent = setup(undefined);
    initProjectRoots({ workspace: silent.root, knownProjects: () => [{ label: "shared", path: shared.root }] });
    const result = await call(shared.handlers, "listMobileFileProjects");
    expect(result).toEqual({ projects: [{ id: projectId(shared.root), label: "shared" }] });
  });
});
