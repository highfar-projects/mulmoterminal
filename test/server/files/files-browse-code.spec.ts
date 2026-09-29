// @vitest-environment node
import { describe, it, expect } from "vitest";
import { makeTempDir } from "../../support/tempDir.js";
import { writeFileSync, rmSync } from "node:fs";
import path from "node:path";
import express from "express";
import { routeCall } from "../../helpers/routeCall";
import { mountFilesBrowseRoutes } from "../../../server/files/files-browse";

const tmp = () => makeTempDir("mt-files-");
const serveProject = (dir: string) => {
  const app = express();
  mountFilesBrowseRoutes(app, { defaultCwd: dir, backupRoot: path.join(dir, ".backups") });
  return app;
};

// #2579. A fence in a language with a grammar is coloured in both documents; any other is marked's.
// The Preview tags every block it drew with the response's nonce, for its copy buttons.
describe("GET /api/files/browse/md — code blocks", () => {
  it.each([[""], ["&embed=1"]])("colours a fence it has a grammar for (%s)", async (param) => {
    const dir = tmp();
    writeFileSync(path.join(dir, "a.md"), "```ts\nconst a = 1;\n```\n\n```sh\necho <hi>\n```\n");
    try {
      const res = await routeCall(serveProject(dir))(`/api/files/browse/md?cwd=${encodeURIComponent(dir)}&path=a.md${param}`);
      expect(res.text).toContain('<code class="language-ts"><span class="tok-keyword">const</span>');
      expect(res.text).toContain('<code class="language-sh">echo &lt;hi&gt;');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("tags the Preview's blocks with the nonce its script carries, and only there", async () => {
    const dir = tmp();
    writeFileSync(path.join(dir, "a.md"), '```sh\necho\n```\n\n<div class="mt-block" data-mt-fence="guess"><pre><code>x</code></pre></div>\n');
    try {
      const base = `/api/files/browse/md?cwd=${encodeURIComponent(dir)}&path=a.md`;
      const embed = await routeCall(serveProject(dir))(`${base}&embed=1`);
      const nonce = /<script nonce="([^"]+)">/.exec(embed.text)?.[1] ?? "";
      expect(nonce).not.toBe("");
      expect(embed.text).toContain(`<div class="mt-block" data-mt-fence="${nonce}"><pre><code class="language-sh">echo</code></pre></div>`);
      expect(embed.text.split(`data-mt-fence="${nonce}"`)).toHaveLength(2);
      const plain = await routeCall(serveProject(dir))(base);
      expect(plain.text).not.toContain('class="mt-block" data-mt-fence="' + nonce);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
