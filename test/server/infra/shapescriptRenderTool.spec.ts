// @vitest-environment node
//
// The renderShapeScript host tool.
//
// Rasterisation needs a real browser, and CI has none — the Puppeteer download is
// not part of these jobs. So the suite PROBES once and splits: the argument
// contract, the path routing and the refusals always run, while the cases that
// need pixels run only where a browser exists (a developer machine, which is
// where a rendering regression would be caught anyway). The alternative — assert
// `rendered === true` everywhere — is what failed CI on the first attempt, and
// asserting nothing would let the whole file pass on a host that cannot render.
import { describe, it, expect } from "vitest";
import { mkdirSync, writeFileSync, existsSync, statSync } from "node:fs";
import path from "node:path";
import { initArtifactsBackend } from "../../../server/backends/artifacts.js";
import { initOpenPathBackend, resetOpenPathBackend } from "../../../server/backends/openPath.js";
import { RENDER_SHAPE_SCRIPT, runRenderShapeScript } from "../../../server/infra/shapescript-render-tool.js";
import { makeTempDir } from "../../support/tempDir";

// Module scope, not `beforeAll`: `it.runIf` is evaluated when the file is COLLECTED,
// which happens before any hook runs. Probing in a hook left the flag false at
// collection time and skipped the pixel cases everywhere — silently no coverage,
// which is worse than the CI failure it was meant to fix.
const ws = makeTempDir("mt-render-tool-");
const ARTIFACT = "artifacts/shapes/lamp.shape";
const REPO_REL = "models/bracket.shape";
const CUBE = "cube {\n size 1\n color 0.2 0.6 0.9\n}";

mkdirSync(path.join(ws, "artifacts", "shapes"), { recursive: true });
writeFileSync(path.join(ws, ARTIFACT), CUBE);
mkdirSync(path.join(ws, "models"), { recursive: true });
writeFileSync(path.join(ws, REPO_REL), CUBE);
initArtifactsBackend({ workspace: ws });
resetOpenPathBackend();
initOpenPathBackend({ workspace: ws });

/** How many times one render is attempted.
 *
 *  NOT flake tolerance for its own sake — it bridges a timeout this repo cannot set. The plugin
 *  gives the browser launch and the rasterisation each an explicit budget and leaves the render
 *  page's NAVIGATION on Puppeteer's default (`src/render/renderer.ts`: `page.goto(PAGE_URL,
 *  { waitUntil: "load" })`), and a loaded Windows runner does not always finish that navigation
 *  inside it (#2095). `RenderShapeScriptOptions` carries no timeout, so the host cannot raise it;
 *  a fresh attempt is a fresh Chromium, which is what gets past it. Remove this once the plugin
 *  sets that timeout (receptron/mulmoclaude#3202) and the bump lands here. */
const RENDER_ATTEMPTS = 3;

/** The ONE failure a retry is allowed to hide, stated as the shape it MUST have rather than as a
 *  list of shapes it must not.
 *
 *  Measured against the installed Puppeteer rather than guessed: a real navigation timeout is an
 *  `Error` whose `name` is `TimeoutError` and whose message is exactly
 *  `Navigation timeout of <n> ms exceeded`, with nothing around it. `\d+` and not today's 30000,
 *  because the upstream fix raises that number and a matcher naming the current default would stop
 *  matching during the changeover — which is the window where the flake still has to be tolerated.
 *
 *  Anything else is NOT retried, and that is deliberate even where it looks safe: an error that
 *  merely CONTAINS the phrase, a rejection that is not an Error, or the same message wrapped by
 *  something that renamed it. Each of those would fail red instead, which is the direction this
 *  file can afford — a returning flake is visible, a hidden regression is not. Three rounds of this
 *  review each found one more message a substring match would have swallowed, which is why the rule
 *  enumerates what passes. */
const isNavigationTimeout = (err: unknown): boolean =>
  err instanceof Error && err.name === "TimeoutError" && /^Navigation timeout of \d+ ms exceeded$/.test(err.message);

/** Run `render`, retrying ONLY that navigation timeout.
 *
 *  Vitest's own `retry` was the first shape of this and it retries EVERYTHING — an assertion that
 *  failed, a render saved to the wrong place, any defect that happens to fail once. Measured: a
 *  first-attempt-only "saved render to the wrong directory" passed under it (Codex, round 1). The
 *  retry belongs to the render call rather than to the case, so a failed assertion is still a
 *  failed assertion, and only the flake this file exists for gets a second chance. */
const retryingNavigationTimeouts = async <T>(render: () => Promise<T>): Promise<T> => {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await render();
    } catch (err) {
      if (attempt >= RENDER_ATTEMPTS || !isNavigationTimeout(err)) throw err;
    }
  }
};

/** Whether this machine can actually rasterise.
 *
 *  Probed rather than assumed, and the probe CANNOT be allowed to throw. A missing
 *  browser answers `rendered: false`, which is tidy — but a browser that launches and
 *  then cannot navigate throws instead, and on Windows CI that is what happens
 *  (`Navigation timeout of 30000 ms exceeded`). An unguarded probe at module scope
 *  took the whole FILE down with it, including the cases that need no browser at all. */
const probe = await retryingNavigationTimeouts(() => runRenderShapeScript({ script: CUBE, views: "single", width: 160, height: 160 })).catch(
  (err: unknown) => ({
    rendered: false,
    message: `probe threw: ${err instanceof Error ? err.message : String(err)}`,
  }),
);
const canRender = probe.rendered;
if (!canRender) console.warn(`[shapescriptRenderTool.spec] cannot rasterise here — skipping the pixel cases: ${probe.message}`);

/** What ONE rasterising case is allowed to take.
 *
 *  The plugin launches a fresh Chromium per call and closes it again (`render.js`: `launch(...)`
 *  … `finally { close() }`), so each of these pays a cold start plus a software-GL render. That is
 *  ~1s on a developer machine and **over the suite's 15s default on a Windows CI runner**, where
 *  the job then failed about half the time — the same four cases, each at exactly 15,000ms
 *  (#2013's release CI). Elsewhere the probe finds no browser and they never run at all, so this
 *  budget is only ever spent where a render genuinely happens. */
const RENDER_TIMEOUT_MS = 60_000;

/** What ONE case is allowed to take. Every attempt shares this budget, unlike Vitest's `retry`,
 *  which gives each attempt its own — so it is the render budget times the attempts. */
const CASE_TIMEOUT_MS = RENDER_ATTEMPTS * RENDER_TIMEOUT_MS;

const savedPath = (message: string): string => {
  const match = /Saved render to (\S+)/.exec(message);
  if (!match?.[1]) throw new Error(`no saved path in: ${message}`);
  return match[1];
};

describe("renderShapeScript host tool", () => {
  it("is offered with the shared contract, not a local copy of it", () => {
    // The description and schema come from the package so the two hosts cannot
    // describe the same tool differently to a model.
    expect(RENDER_SHAPE_SCRIPT.name).toBe("renderShapeScript");
    expect(RENDER_SHAPE_SCRIPT.description).toContain("four camera angles");
    expect(Object.keys(RENDER_SHAPE_SCRIPT.parameters?.properties ?? {})).toEqual(
      expect.arrayContaining(["script", "path", "azimuth", "elevation", "zoom", "views", "projection", "width", "height"]),
    );
  });

  // Everything this one render can settle, settled here: a second case asking the same question of
  // a second render costs another whole Chromium (see RENDER_TIMEOUT_MS), and answers nothing the
  // first could not. ABSOLUTE is the point of the path assertion — MulmoTerminal's sessions run in
  // per-project directories, so a workspace-relative answer resolves to nothing from the cwd the
  // agent is in, or worse to a different file that happens to share the name.
  it.runIf(canRender)("renders an inline script and answers with an absolute path under the workspace artifacts", { timeout: CASE_TIMEOUT_MS }, async () => {
    const { message, rendered } = await retryingNavigationTimeouts(() => runRenderShapeScript({ script: CUBE, views: "single", width: 200, height: 200 }));
    expect(rendered).toBe(true);
    const file = savedPath(message);
    expect(path.isAbsolute(file)).toBe(true);
    expect(file.startsWith(path.join(ws, "artifacts", "renders"))).toBe(true);
    expect(statSync(file).size).toBeGreaterThan(0);
  });

  it.runIf(canRender)("renders a saved model by its artifact path", { timeout: CASE_TIMEOUT_MS }, async () => {
    const { rendered, message } = await retryingNavigationTimeouts(() => runRenderShapeScript({ path: ARTIFACT, views: "single", width: 200, height: 200 }));
    expect(rendered).toBe(true);
    expect(existsSync(savedPath(message))).toBe(true);
  });

  it.runIf(canRender)("renders a .shape outside the artifacts root through byPath", { timeout: CASE_TIMEOUT_MS }, async () => {
    const { rendered } = await retryingNavigationTimeouts(() => runRenderShapeScript({ path: REPO_REL, views: "single", width: 200, height: 200 }));
    expect(rendered).toBe(true);
  });

  // The retry rule itself, with no browser involved — which is the point: on a host that cannot
  // rasterise, every case above skips, so without these the behaviour under review is unverifiable
  // exactly where it is most likely to be reviewed (Codex's sandbox reported "4 passed | 3 skipped").
  //
  // Both directions on purpose. A rule that only ever asserts "this is retried" passes just as well
  // when it retries EVERYTHING, which is what the first two shapes of it did.
  const navigationTimeout = (ms: number) => Object.assign(new Error(`Navigation timeout of ${ms} ms exceeded`), { name: "TimeoutError" });
  const failingOnce = (err: unknown) => {
    let calls = 0;
    return {
      calls: () => calls,
      render: async () => {
        calls += 1;
        if (calls === 1) throw err;
        return "a sheet";
      },
    };
  };

  it("retries the navigation timeout this file exists for", async () => {
    // Shaped as the installed Puppeteer actually throws it — measured, not assumed.
    const flake = failingOnce(navigationTimeout(30_000));
    await expect(retryingNavigationTimeouts(flake.render)).resolves.toBe("a sheet");
    expect(flake.calls()).toBe(2);
  });

  it("still retries it once the upstream fix raises the number", async () => {
    // 60000 is what receptron/mulmoclaude#3202 reports; a matcher naming today's 30000 would stop
    // matching during the changeover, which is the window this bridge exists for.
    const flake = failingOnce(navigationTimeout(60_000));
    await expect(retryingNavigationTimeouts(flake.render)).resolves.toBe("a sheet");
    expect(flake.calls()).toBe(2);
  });

  // The near misses. Each of these is a defect that fails once and would pass if the rule matched
  // loosely — the first shape of it used Vitest's `retry` and swallowed all of them.
  it.each([
    { what: "an unrelated failure", err: new Error("saved render to the wrong directory") },
    { what: "a message that merely CONTAINS the phrase", err: new Error("render failed after a previous Navigation timeout of 30000 ms exceeded") },
    {
      what: "the phrase with anything appended",
      err: Object.assign(new Error("Navigation timeout of 30000 ms exceeded (retrying)"), { name: "TimeoutError" }),
    },
    { what: "a rejection that is not an Error", err: "Navigation timeout of 30000 ms exceeded" },
    { what: "the same message under another name, which a wrapper would produce", err: new Error("Navigation timeout of 30000 ms exceeded") },
  ])("does not retry $what, so a defect that fails once still fails", async ({ err }) => {
    const flake = failingOnce(err);
    await expect(retryingNavigationTimeouts(flake.render)).rejects.toBeDefined();
    expect(flake.calls()).toBe(1);
  });

  it("gives up after the attempt budget rather than retrying forever", async () => {
    let calls = 0;
    await expect(
      retryingNavigationTimeouts(async () => {
        calls += 1;
        throw navigationTimeout(60_000);
      }),
    ).rejects.toThrow(/Navigation timeout/);
    expect(calls).toBe(RENDER_ATTEMPTS);
  });

  it("refuses a path that is not a .shape file", async () => {
    await expect(runRenderShapeScript({ path: "notes.txt" })).rejects.toThrow(/must name a .shape file/);
  });

  it("refuses a traversal path", async () => {
    await expect(runRenderShapeScript({ path: "artifacts/shapes/../../secrets.shape" })).rejects.toThrow();
  });

  it("requires one source and refuses both", async () => {
    await expect(runRenderShapeScript({})).rejects.toThrow(/Provide either/);
    await expect(runRenderShapeScript({ script: CUBE, path: ARTIFACT })).rejects.toThrow(/not both/);
  });
});
