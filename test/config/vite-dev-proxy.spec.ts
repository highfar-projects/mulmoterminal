// @vitest-environment node
// The dev proxy is the only thing keeping an iframe `src` off Vite's SPA catch-all, and the
// failure is silent in the worst way: index.html answers 200, so the iframe renders blank and
// the console blames CORS on `/@vite/client` (#1758 — `/htmlfile` had been missing since the
// mount was added, while `/artifacts` beside it was fine).
//
// So the check is against the URLs the Canvas ACTUALLY builds, not a second list of prefixes:
// a new URL shape from the plugin fails here rather than in a blank pane.
import { describe, it, expect } from "vitest";
import { htmlArtifactPreviewUrl, htmlFileUrl } from "@mulmoclaude/html-plugin";
import viteConfig from "../../vite.config.js";

const proxy = viteConfig.server?.proxy ?? {};
const prefixes = Object.keys(proxy);

const isProxied = (url: string): boolean => prefixes.some((prefix) => url === prefix || url.startsWith(`${prefix}/`));

const iframeSources: [string, string | null][] = [
  ["a page presentHtml wrote", htmlArtifactPreviewUrl("artifacts/html/2026/08/report.html")],
  ["an absolute path presentHtml was pointed at", htmlFileUrl("/Users/someone/proj/demo.html")],
  ["a workspace-relative path presentHtml was pointed at", htmlFileUrl("docs/report.html")],
];

describe("vite dev proxy", () => {
  it.each(iframeSources)("forwards the iframe src for %s to the backend", (label, url) => {
    if (url === null) throw new Error(`the html plugin built no URL for ${label} — the fixture path no longer qualifies`);
    expect(isProxied(url)).toBe(true);
  });
});
