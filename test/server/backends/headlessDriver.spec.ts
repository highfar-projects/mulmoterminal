// @vitest-environment node
//
// The driver a headless run puts its questions through, against a real browser: which frame it asks,
// and what a question to a frame that is gone becomes.
//
// Every mount REPLACES the iframe (`render` removes the old one), so a frame handle from one mount is
// detached by the next. Holding one across a mount is what ended whole runs on a slow Windows runner
// with "Attempted to use detached Frame" (#2588); here it is held on purpose, so the case does not
// depend on a runner being slow. Skipped when no browser is installed, as the contract test is.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Browser } from "puppeteer";
import { browserOrProblem, openDriver, serveHarness, type Driver, type HeadlessPageInput } from "../../../server/backends/sharedApp/headlessPreview.js";

// Started at module scope: collection has no per-test budget (CLAUDE.md).
const started = await browserOrProblem();
const browser: Browser | null = started.ok ? started.browser : null;

const page = (id: string, text: string): HeadlessPageInput => ({
  id,
  audience: "public",
  html: `<p>${text}</p><button type="button">Go</button>`,
  datasets: {},
  submit: null,
});

describe.skipIf(browser === null)("the headless driver, in a real browser", () => {
  let harness: { origin: string; close: () => Promise<void> } | null = null;
  let driver: Driver | null = null;

  beforeAll(async () => {
    if (browser === null) return;
    harness = await serveHarness();
    driver = await openDriver(browser, harness.origin);
  }, 60_000);

  afterAll(async () => {
    await harness?.close();
    await browser?.close();
  });

  const mounted = async (input: HeadlessPageInput): Promise<Driver> => {
    if (driver === null) throw new Error("the driver did not open");
    await driver.mount(input);
    return driver;
  };

  it("asks the document the harness holds now, not one an earlier mount left behind", async () => {
    await mounted(page("first", "the first page"));
    const current = await mounted(page("second", "the second page"));
    const frame = await current.frame();
    expect(frame).not.toBeNull();
    expect(frame?.detached).toBe(false);
    if (frame !== null) expect(await current.evaluate("document.body.innerText", frame)).toContain("the second page");
  });

  it("says a survey of a frame that was replaced could not be taken, instead of throwing", async () => {
    const first = await mounted(page("first", "the first page"));
    const stale = await first.frame();
    if (stale === null) throw new Error("no frame after a mount");
    const second = await mounted(page("second", "the second page"));
    expect(stale.detached).toBe(true);
    // What the unguarded survey met: thrown SYNCHRONOUSLY, before any promise a `.catch` could hold.
    expect(() => stale.$$("button")).toThrow(/detached/i);
    expect(await second.controls(stale)).toEqual([]);
    expect(second.askFailures().join("\n")).toMatch(/the preview could not put a question to this page: .*detached/i);
  });

  it("says a question to a frame that was replaced could not be put, instead of throwing", async () => {
    const first = await mounted(page("first", "the first page"));
    const stale = await first.frame();
    if (stale === null) throw new Error("no frame after a mount");
    const second = await mounted(page("second", "the second page"));
    expect(await second.evaluate("document.title", stale)).toBeUndefined();
    expect(second.askFailures().join("\n")).toMatch(/could not put a question to this page: .*detached/i);
  });

  it("surveys the current frame's controls", async () => {
    const current = await mounted(page("third", "the third page"));
    const frame = await current.frame();
    if (frame === null) throw new Error("no frame after a mount");
    expect(await current.controls(frame)).toHaveLength(1);
    expect(current.askFailures()).toEqual([]);
  });
});
