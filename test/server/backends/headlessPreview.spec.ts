// @vitest-environment node
//
// THE CONTRACT TEST, in a real browser, and there is exactly one of it.
//
// The plan requires it and names the reason (`plans/feat-shared-app-preview.md`, section 7): jsdom
// reproduces NEITHER of the two failures this feature exists to catch. There is no sandbox, so
// `allow-forms` cannot be absent from it; there is no meaningful `MessagePort` lifetime, so a
// handshake answered by a document that no longer exists is not modelled. A suite that checked
// this against jsdom would pass while both bugs shipped — which is what happened, in a real app,
// twice in ten minutes.
//
// So this one test drives Chrome, and it drives it with the two pages from that incident:
//
//   the page that WORKS  — `ready()` outside `onState`, a `<div>` and a `type="button"` button.
//   the page that SHIPPED — a `<form>`, and `ready()` inside the `onState` callback.
//
// It is skipped, loudly, when no browser is installed. Skipping is right and failing is not: a
// browser is an optional dependency of this server (see `browserOrProblem`), and a machine without
// one gets a headless preview that says so rather than a suite that goes red.
import { describe, expect, it } from "vitest";
import { runPagesHeadless, type HeadlessPageInput } from "../../../server/backends/sharedApp/headlessPreview.js";

/** Whether Chrome is on this machine, asked by STARTING one and closing it again.
 *
 *  Not by checking `executablePath()`: that answered "no" on a machine where the launch then
 *  succeeded — puppeteer resolves a browser from its cache directory and from the environment, and
 *  a path check knows about neither. The probe has to be the thing itself.
 *
 *  At module scope on purpose. Collection has no per-test budget, so the launch is billed to
 *  nobody; inside an `it` it would be charged against `testTimeout` (CLAUDE.md). */
const chromeReady: boolean = await (async () => {
  try {
    const puppeteer = (await import("puppeteer")).default;
    await (await puppeteer.launch({ headless: true })).close();
    return true;
  } catch {
    return false;
  }
})();

const datasets = { menu: [{ title: "Curry" }, { title: "Ramen" }] };
const submit = { orders: { createFields: ["name"] } };

/** What a working page looks like, and every line of it is load-bearing. */
const WORKS = `
<div id="menu">loading…</div>
<input id="name">
<button type="button" id="go">Order</button>
<script>
  const view = window.__MC_APP_VIEW;
  view.onState((collections) => {
    document.getElementById("menu").textContent = (collections.menu || []).map((row) => row.title).join(", ");
  });
  document.getElementById("go").addEventListener("click", () => {
    view.submit("orders", { name: document.getElementById("name").value });
  });
  view.ready();
</script>`;

/** What was published, twice, with nobody having pressed the button. */
const SHIPPED = `
<div id="menu">loading…</div>
<form id="f">
  <input name="name">
  <button type="submit">Order</button>
</form>
<script>
  const view = window.__MC_APP_VIEW;
  view.onState((collections) => {
    document.getElementById("menu").textContent = "drawn";
    view.ready();
  });
  document.getElementById("f").addEventListener("submit", (event) => {
    event.preventDefault();
    view.submit("orders", { name: "x" });
  });
</script>`;

const page = (id: string, html: string): HeadlessPageInput => ({ id, audience: "public", html, datasets, submit });

describe.skipIf(!chromeReady)("a headless run, in a real browser", () => {
  it("separates the page that works from the page that shipped", async () => {
    const run = await runPagesHeadless([page("works", WORKS), page("shipped", SHIPPED)]);
    expect(run.ok).toBe(true);
    if (!run.ok) return;
    const [works, shipped] = run.pages;

    // The handshake completed, the records arrived, and the page DREW them — the text on screen
    // is the assertion, because "it rendered" and "it is still on its loading state" are the two
    // states a preview exists to tell apart.
    expect(works?.readied).toBe(true);
    expect(works?.stateDelivered).toBe(true);
    expect(works?.text).toContain("Curry, Ramen");
    expect(works?.liveForms).toBe(0);
    // The press reached the parent as a submission for the declared collection — and was
    // declined, so nothing was written.
    expect(works?.presses[0]?.submitted).toEqual({ cid: "orders", fields: ["name"] });

    // `ready()` inside `onState` is a deadlock: the parent sends no state until `ready` arrives,
    // so the callback never runs, so `ready` is never sent. The page sits on "loading…".
    expect(shipped?.readied).toBe(false);
    expect(shipped?.stateDelivered).toBe(false);
    expect(shipped?.text).toContain("loading");
    // And the Submit button does nothing at all: the browser blocks the submission BEFORE the
    // `submit` event fires, so the handler that would have called `view.submit` never runs.
    expect(shipped?.liveForms).toBe(1);
    expect(shipped?.presses[0]?.submitted).toBeNull();
    expect(shipped?.presses[0]?.blockedFormSubmission).toBe(true);
  }, 120_000);
});

describe.skipIf(chromeReady)("without a browser", () => {
  it("says so, and says what to do instead, rather than pretending to have run", async () => {
    const run = await runPagesHeadless([page("works", WORKS)]);
    expect(run.ok).toBe(false);
    if (run.ok) return;
    expect(run.problems.join(" ")).toContain("real browser");
    expect(run.problems.join(" ")).toContain("Collections pane");
  });
});
