// @vitest-environment node
import { describe, it, expect, beforeAll } from "vitest";
import express from "express";
import { mkdirSync, symlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { appRequest } from "../../helpers/appRequest.js";
import { mountFilesPageRoute } from "../../../server/backends/filesPage.js";
import { filesPageUrl } from "../../../common/filesPage.js";
import { makeTempDir } from "../../support/tempDir";

// #2269. The Files pane's Preview of an HTML file. It serves file bytes, so it takes both of its
// rules from routes that already do: the raw route's authorised base, and presentHtml's CSP.
let request: ReturnType<typeof appRequest>;
let ws: string;
let session: string;
let stranger: string;

beforeAll(() => {
  ws = makeTempDir("mt-page-ws-");
  session = makeTempDir("mt-page-session-");
  stranger = makeTempDir("mt-page-stranger-");
  mkdirSync(path.join(session, "reports"), { recursive: true });
  writeFileSync(path.join(session, "reports", "weekly.html"), "<!doctype html><html><body>WEEKLY</body></html>");
  writeFileSync(path.join(session, "reports", "chart.png"), "PNG");
  writeFileSync(path.join(stranger, "secret.html"), "<html>SECRET</html>");
  symlinkSync(path.join(stranger, "secret.html"), path.join(session, "reports", "link.html"));
  const app = express();
  mountFilesPageRoute(app, { workspace: ws, sessionCwds: () => [session] });
  request = appRequest(app);
});

describe("the Files pane's page route", () => {
  it("serves an HTML file under a live session's directory, sandboxed and offline", async () => {
    const res = await request(filesPageUrl(session, "reports/weekly.html"));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
    const csp = res.headers.get("content-security-policy") ?? "";
    expect(csp).toContain("sandbox allow-scripts");
    expect(csp).not.toContain("allow-same-origin");
    expect(csp).toContain("connect-src 'none'");
    expect(await res.text()).toContain("WEEKLY");
  });

  // The pane's version query does not name another file.
  it("ignores the query the pane adds to refetch a changed page", async () => {
    const res = await request(`${filesPageUrl(session, "reports/weekly.html")}?v=abc`);
    expect(res.status).toBe(200);
  });

  // The raw route's rule, unchanged: a base the server does not serve from is refused, whatever
  // file it holds.
  it("refuses a base that is neither the workspace nor a live session", async () => {
    const res = await request(filesPageUrl(stranger, "secret.html"));
    expect(res.status).toBe(403);
  });

  it("refuses a path that climbs out of its base, spelled or linked", async () => {
    expect((await request(filesPageUrl(session, "../" + path.basename(stranger) + "/secret.html"))).status).toBe(403);
    expect((await request(filesPageUrl(session, "reports/link.html"))).status).toBe(403);
  });

  // An escape cannot hide a separator in one segment: each is decoded on its own.
  it("does not let an encoded slash smuggle a separator", async () => {
    const res = await request(`/api/files/page/${encodeURIComponent(session)}/reports%2Fweekly.html`);
    expect(res.status).toBe(404);
  });

  // What the page links relatively — the chart beside it — goes to the raw route, which serves it.
  it("hands anything but the page to the raw route", async () => {
    const res = await request(filesPageUrl(session, "reports/chart.png"));
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe(`/api/files/raw?cwd=${encodeURIComponent(session)}&path=${encodeURIComponent("reports/chart.png")}`);
  });

  it("answers a missing page with 404", async () => {
    expect((await request(filesPageUrl(session, "reports/none.html"))).status).toBe(404);
  });
});
