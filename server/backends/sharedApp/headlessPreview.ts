// Running a shared app's pages, from the terminal, before anything is published.
//
// WHY THIS EXISTS. The pages are written by an agent and the agent cannot press a button. Everything
// else built for this problem stops short of the same line: `viewDefects.ts` READS a page and
// catches the two failures we have already met, and the Collections pane RUNS one but needs a
// person in front of it. What shipped broken (a lunch sign-up, published twice with a dead Submit
// button, 2026-08-14) was written, checked, deployed and published without the document ever being
// loaded once. This is the door that closes that: `manageSharedApp` with `action: "preview"`.
//
// WHAT IT PROVES, AND WHAT IT DOES NOT. It proves the document loads, the handshake completes, the
// records arrive, and a press reaches the parent as a submission the declaration accepts. It does
// NOT prove the deployed rules would accept the write — the run never accepts a confirmation (see
// `headlessHarness.ts`), because a tool call is not a person and the accept path writes a real
// record to the live database as the author. The table in `plans/feat-shared-app-preview.md`
// ("プレビューが証明しないもの") is the full list, and it applies here unchanged.
//
// ONE PRESS PER DOCUMENT. Each button is pressed on a freshly mounted page rather than in sequence
// on one, so what is reported about the third button is not a consequence of the first two. It
// costs a render each and buys an answer that can be read on its own.
//
// A REAL BROWSER, and that is not negotiable. jsdom has no sandbox, so it reproduces neither of the
// two failures this exists for: `allow-forms` is not absent because there is no attribute to be
// absent from, and a `MessagePort` handed to a document that no longer exists is not a thing it
// models. A run with no browser installed says so and reports nothing, which is the honest answer.
import { createServer, type Server } from "node:http";
import type { Browser, Frame } from "puppeteer";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isRecord } from "../../../common/isRecord.js";
import type { PreviewAudience, PreviewDataset } from "../../../common/sharedAppPreview.js";
import { previewPageKey } from "../../../common/sharedAppPreview.js";
import { previewSharedApp } from "./preview.js";
import { VIEW_MOUNT, HARNESS_HTML, type HarnessObservation } from "./headlessHarness.js";

/** One document to run, with everything the parent would hand it. */
export interface HeadlessPageInput {
  id: string;
  audience: PreviewAudience;
  html: string;
  /** The records this page's own projection would receive — per page, never per app, for the
   *  reason `PreviewDatasets` gives: a member page may name a collection the public one must not
   *  be handed. */
  datasets: Record<string, PreviewDataset>;
  /** The real declaration. `null` for an app that opens nothing to the public — NOT an empty map,
   *  which does not switch the parent's check off but makes it refuse everything with
   *  `unknown-collection`, blaming a declaration that is correct. */
  submit: Record<string, { createFields: string[] }> | null;
}

/** What one press produced. */
export interface HeadlessPress {
  label: string;
  /** The control had nowhere to be clicked — `display:none`, zero-sized, or off the document.
   *
   *  Its own answer rather than a press that reached nothing, because the two want opposite things
   *  done about them: one is a handler that is not wired up, the other is a control no cursor can
   *  arrive at.
   *
   *  What tells them apart is that the press is a REAL press — dispatched at the control's
   *  coordinates, through the browser. `element.click()` in the page's own realm invokes the
   *  handler whatever is on top of the button, so a control under an overlay would be reported as
   *  submitting. It is not reported as unclickable either: the click happens, the overlay receives
   *  it, and nothing reaches the parent — which is exactly what the visitor gets. */
  notClickable: boolean;
  /** The submission that reached the parent, if one did. `null` is the dead button. */
  submitted: { cid: string; fields: string[] } | null;
  /** What the parent refused before drawing a confirmation. Invisible in a browser: it is answered
   *  on the port, into a promise the page usually does not await. */
  refused: string[];
  /** The browser reported a form submission the sandbox blocked. The page cannot see this happen —
   *  the `submit` event never fires, so `preventDefault()` never runs — and neither can the author,
   *  unless they have the console open. */
  blockedFormSubmission: boolean;
  errors: string[];
}

export interface HeadlessPageReport {
  id: string;
  audience: PreviewAudience;
  readied: boolean;
  stateDelivered: boolean;
  /** Submissions the page made BEFORE anything was pressed — on load, from `onState`, from a
   *  timer. Its own number because it is two findings at once: a visitor is shown a confirmation
   *  they never asked for, and every press below would otherwise inherit it. */
  submittedOnLoad: number;
  /** Forms in the LIVE document, which is a different question from the one `viewDefects.ts` asks
   *  of the source: a page that builds its form in JavaScript has none in its HTML. */
  liveForms: number;
  /** What is actually on the screen, trimmed. The single most useful line in the report — a page
   *  stuck on its loading state says so here in the author's own words. */
  text: string;
  presses: HeadlessPress[];
  /** Controls this run did NOT press. Counted rather than inferred from `presses.length`: a page
   *  with exactly the budget's worth of controls and a page whose eleventh control was dropped
   *  produce the same length, so the report would either claim a truncation that did not happen or
   *  hide one that did. */
  pressesOmitted: number;
  errors: string[];
}

export type HeadlessRun =
  | {
      ok: true;
      pages: HeadlessPageReport[];
      /** Pages the budget dropped. Carried rather than left to be inferred from a count, because
       *  "ran 6 pages" reads as "ran the app" — and the seventh is then published having never
       *  been loaded, which is the exact failure this whole action exists to end. */
      omittedPages: number;
    }
  | { ok: false; problems: string[] };

/** How much of one run is enough. Every one of these is a budget rather than a rule about pages:
 *  a run is started by an agent waiting on a tool call, and an app with forty buttons is not worth
 *  forty renders to say the same thing. What is dropped is REPORTED (see `narrate`), because a
 *  silent cap reads as "everything was covered". */
export const LIMITS = { pages: 6, presses: 6, readyMs: 4000, settleMs: 600, textChars: 400 } as const;

/** The clickable things, in document order. `input[type=submit]` is in the list although the
 *  sandbox will never let one submit — that IS the finding, and a scan that skipped them would
 *  report a page with no buttons at all. */
const CLICKABLE = "button, [role=button], input[type=submit], input[type=button], a[href='#']";

const messageOf = (err: unknown): string => (err instanceof Error ? err.message : String(err));

/** The runtime's own `dist/view`, resolved rather than guessed.
 *
 *  `import.meta.resolve` and not a path relative to this file: this repository is itself an npm
 *  package, so where `@receptron/sharedapp` lands depends on the install that put it there
 *  (hoisted beside us, nested under us, or a workspace link), and a hand-built path is right on a
 *  developer's machine and wrong under `npx`. */
function viewDistDir(): string {
  return path.dirname(fileURLToPath(import.meta.resolve("@receptron/sharedapp/view")));
}

/** Serve the harness and the runtime, on a loopback port, for the life of one run.
 *
 *  Over HTTP rather than `setContent` or a `data:` URL because the harness is an ES MODULE and its
 *  imports are relative: it needs a real base URL to resolve them against. 127.0.0.1 is also a
 *  secure context, which `viewNonce`'s `crypto.randomUUID()` requires. */
async function serveHarness(): Promise<{ origin: string; close: () => Promise<void> }> {
  const dir = viewDistDir();
  // An ALLOW-LIST built from the directory, so a request path never becomes a filesystem path.
  const allowed = new Set((await readdir(dir)).filter((name) => name.endsWith(".js")));
  const server: Server = createServer((req, res) => {
    void (async () => {
      const pathname = new URL(req.url ?? "/", "http://127.0.0.1").pathname;
      if (pathname === "/") {
        res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
        res.end(HARNESS_HTML);
        return;
      }
      // Answered rather than left to 404, because the browser asks for it unprompted and the miss
      // lands in the page's own console — where this run collects it and reports it to the author
      // as something their page did.
      if (pathname === "/favicon.ico") {
        res.writeHead(204).end();
        return;
      }
      const name = pathname.startsWith(`${VIEW_MOUNT}/`) ? pathname.slice(VIEW_MOUNT.length + 1) : "";
      if (!allowed.has(name)) {
        res.writeHead(404).end();
        return;
      }
      res.writeHead(200, { "content-type": "text/javascript; charset=utf-8" });
      res.end(await readFile(path.join(dir, name)));
    })().catch(() => {
      if (!res.headersSent) res.writeHead(500).end();
    });
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  const port = typeof address === "object" && address !== null ? address.port : 0;
  return {
    origin: `http://127.0.0.1:${port}`,
    close: () =>
      new Promise<void>((resolve) => {
        server.close(() => resolve());
      }),
  };
}

/** Fill every empty input with something of the right shape.
 *
 *  Because a press is judged on a freshly mounted page, and a page that validates its own form
 *  would then refuse for a reason that has nothing to do with what is being tested. The values are
 *  deliberately dull: nothing is ever written, so they only have to get past the page's own checks.
 *
 *  Runs INSIDE the frame, as a string, because the frame's origin is opaque — the harness cannot
 *  reach into it, and only the browser automation can. */
const FILL_INPUTS = `(() => {
  const fill = (el, value) => {
    el.value = value;
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  };
  for (const el of document.querySelectorAll("input, textarea, select")) {
    if (el.disabled) continue;
    if (el.tagName === "SELECT") {
      const option = [...el.options].find((o) => o.value !== "");
      if (option !== undefined && el.value === "") fill(el, option.value);
      continue;
    }
    if (el.type === "checkbox" || el.type === "radio") {
      if (!el.checked) { el.checked = true; el.dispatchEvent(new Event("change", { bubbles: true })); }
      continue;
    }
    if (el.value !== "") continue;
    if (el.type === "email") fill(el, "preview@example.com");
    else if (el.type === "number" || el.type === "range") fill(el, "1");
    else if (el.type === "date") fill(el, "2026-01-01");
    else if (el.type === "datetime-local") fill(el, "2026-01-01T10:00");
    else if (el.type === "time") fill(el, "10:00");
    else if (el.type === "tel") fill(el, "09000000000");
    else if (el.type === "url") fill(el, "https://example.com");
    else fill(el, "preview");
  }
})()`;

/** What a person would call this control. Falls back through the places a label can hide, and
 *  ends at the tag name so a press is never reported as an empty string. */
const LABELS = `[...document.querySelectorAll(${JSON.stringify(CLICKABLE)})].map((el) =>
  (el.innerText || el.value || el.getAttribute("aria-label") || el.id || el.tagName).trim().replace(/\\s+/g, " ").slice(0, 60))`;

/** Puppeteer, or the reason there is none.
 *
 *  Lazily, and tolerantly, for the reason `server/backends/markdown.ts` gives: it is a heavy
 *  optional dependency and this server has to boot without it. A run with no browser is an answer,
 *  not a crash. */
async function browserOrProblem(): Promise<{ ok: true; browser: Browser } | { ok: false; problems: string[] }> {
  try {
    const puppeteer = (await import("puppeteer")).default;
    return { ok: true, browser: await puppeteer.launch({ headless: true }) };
  } catch (err) {
    return {
      ok: false,
      problems: [
        `A headless preview needs a real browser and none could be started (${messageOf(err)}).`,
        "jsdom is not an alternative: it has no sandbox, so it reproduces neither the blocked form submission nor the dropped port that this exists to catch.",
        "Ask the user to open the Collections pane and press Preview instead — it runs the same parent, with them in front of it.",
      ],
    };
  }
}

/** Reading back what crossed `evaluate`.
 *
 *  Narrowed rather than asserted, and that is a house rule with teeth here: what comes back is a
 *  value the BROWSER produced, on the far side of a boundary this process does not control, so an
 *  assertion would be a promise about somebody else's runtime. A malformed answer degrades to
 *  "nothing observed" — which reads, correctly, as a page that did nothing. */
const asString = (value: unknown): string => (typeof value === "string" ? value : "");
const asNumber = (value: unknown): number => (typeof value === "number" ? value : 0);
const asStrings = (value: unknown): string[] => (Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : []);

const asSubmitted = (value: unknown): { cid: string; fields: string[] }[] =>
  Array.isArray(value)
    ? value.flatMap((entry) => (isRecord(entry) && typeof entry.cid === "string" ? [{ cid: entry.cid, fields: asStrings(entry.fields) }] : []))
    : [];

const asObservation = (value: unknown): HarnessObservation =>
  isRecord(value)
    ? {
        readied: value.readied === true,
        stateDelivered: value.stateDelivered === true,
        submitted: asSubmitted(value.submitted),
        refused: asStrings(value.refused),
      }
    : { readied: false, stateDelivered: false, submitted: [], refused: [] };

const BLOCKED_FORM = "Blocked form submission";

/** The browser, with everything one run needs said in this repository's words rather than
 *  puppeteer's. Made by `openDriver` so the reporting below reads as what it is doing rather than
 *  as automation. */
interface Driver {
  /** Mount one document and wait for the handshake — or for the wait to run out, which is itself
   *  the answer (`ready()` never reached the parent). Clears what the browser has said, so what is
   *  collected afterwards belongs to THIS document. */
  mount: (input: HeadlessPageInput) => Promise<void>;
  observe: () => Promise<HarnessObservation>;
  /** The rendered document. `null` while nothing is mounted. */
  frame: () => Frame | null;
  /** Everything the BROWSER said since the last mount, not only what the page's own scripts said.
   *  A blocked form submission arrives this way and by no other: the browser refuses, so there is
   *  no exception, no rejected promise, and nothing for the page to catch. */
  noise: () => string[];
  evaluate: (script: string, target?: Frame) => Promise<unknown>;
  decline: () => Promise<void>;
}

async function openDriver(browser: Browser, origin: string): Promise<Driver> {
  const page = await browser.newPage();
  let noise: string[] = [];
  page.on("console", (message) => noise.push(message.text()));
  page.on("pageerror", (err) => noise.push(messageOf(err)));
  await page.goto(origin, { waitUntil: "load" });
  /** Every script is sent as a STRING rather than as a closure: the server's TypeScript project
   *  declares no DOM (`types: ["node"]`), so a closure mentioning `window` would not compile. */
  const evaluate = (script: string, target?: Frame): Promise<unknown> => (target ?? page).evaluate(script);
  return {
    evaluate,
    frame: () => page.frames().find((candidate) => candidate.url() === "about:srcdoc") ?? null,
    noise: () => noise,
    observe: async () => asObservation(await evaluate("window.__preview.observe()")),
    decline: async () => {
      await evaluate("window.__preview.decline()");
    },
    mount: async (input) => {
      noise = [];
      await evaluate(`window.__preview.render(${JSON.stringify({ html: input.html, datasets: input.datasets, submit: input.submit })})`);
      await page.waitForFunction("window.__preview.observe().readied", { timeout: LIMITS.readyMs }).catch(() => undefined);
      await new Promise((resolve) => setTimeout(resolve, LIMITS.settleMs));
    },
  };
}

/** Press ONE control, on a document mounted for it alone.
 *
 *  Freshly mounted rather than pressed in sequence, so what is reported about the third control is
 *  not a consequence of the first two — and the inputs are filled first, so a page that validates
 *  its own form does not refuse for a reason that has nothing to do with what is being asked. */
async function pressOne(driver: Driver, input: HeadlessPageInput, index: number, label: string): Promise<HeadlessPress | null> {
  await driver.mount(input);
  const frame = driver.frame();
  if (frame === null) return null;
  await driver.evaluate(FILL_INPUTS, frame);
  // WHAT WAS ALREADY THERE, taken immediately before the press.
  //
  // The recorder is cleared per MOUNT, not per press, and a page can submit on load — from its
  // opening script, from `onState`, from a timer inside the settle window. Read without this,
  // `submitted[0]` is that automatic submission, reported as the work of whichever control
  // happened to be under test — so EVERY button on such a page looks correctly wired even when
  // none of them is. Only what appears after this line belongs to the press.
  const before = await driver.observe();
  const noiseBefore = driver.noise().length;
  // THROUGH THE BROWSER, at the control's coordinates, so the event lands where a person's would.
  // `element.click()` in the page's own realm invokes the handler regardless of what covers the
  // button — and this action would then report a submission reaching the parent for a control
  // nobody can press, which is the opposite of what it promises.
  const controls = await frame.$$(CLICKABLE);
  const notClickable = await controls[index]
    ?.click()
    .then(() => false)
    .catch(() => true);
  await new Promise((resolve) => setTimeout(resolve, LIMITS.settleMs));
  const after = await driver.observe();
  // Answered the way somebody who changed their mind would, so the page's own "cancelled" path
  // runs and nothing is left waiting on a promise that never settles.
  await driver.decline();
  const noise = driver.noise().slice(noiseBefore);
  return {
    label,
    notClickable: notClickable !== false,
    submitted: after.submitted[before.submitted.length] ?? null,
    refused: after.refused.slice(before.refused.length),
    blockedFormSubmission: noise.some((line) => line.includes(BLOCKED_FORM)),
    errors: [...new Set(noise.filter((line) => !line.includes(BLOCKED_FORM)))],
  };
}

async function reportPage(driver: Driver, input: HeadlessPageInput): Promise<HeadlessPageReport> {
  await driver.mount(input);
  const observed = await driver.observe();
  // Taken NOW: every press below mounts again, which clears it, and what belongs in the page's own
  // report is what the document said when it was left alone.
  const errors = [...new Set(driver.noise())];
  const frame = driver.frame();
  const labels = frame === null ? [] : asStrings(await driver.evaluate(LABELS, frame));
  const liveForms = frame === null ? 0 : asNumber(await driver.evaluate(`document.querySelectorAll("form").length`, frame));
  const text =
    frame === null ? "" : asString(await driver.evaluate(`(document.body.innerText || "").replace(/\\s+/g, " ").trim().slice(0, ${LIMITS.textChars})`, frame));

  const presses: HeadlessPress[] = [];
  for (const [index, label] of labels.slice(0, LIMITS.presses).entries()) {
    const press = await pressOne(driver, input, index, label);
    if (press !== null) presses.push(press);
  }
  return {
    id: input.id,
    audience: input.audience,
    readied: observed.readied,
    stateDelivered: observed.stateDelivered,
    submittedOnLoad: observed.submitted.length,
    liveForms,
    text,
    presses,
    pressesOmitted: Math.max(0, labels.length - LIMITS.presses),
    errors,
  };
}

/** Run the pages. Separated from the Firestore half below so a test can drive it with a page it
 *  wrote by hand — no app, no session, no database. */
export async function runPagesHeadless(pages: readonly HeadlessPageInput[]): Promise<HeadlessRun> {
  const started = await browserOrProblem();
  if (!started.ok) return started;
  const { browser } = started;
  // Started INSIDE the try, because it can throw on a reachable path — `import.meta.resolve` on a
  // layout that does not have the package where it looks, or a `dist/view` that is not there — and
  // a throw before the try leaves the launched browser running with nobody holding it. The failure
  // has to come back as an answer for the same reason everything else here does: the caller is a
  // tool call whose contract is prose, not an exception.
  let harness: { origin: string; close: () => Promise<void> } | null = null;
  try {
    harness = await serveHarness();
    const driver = await openDriver(browser, harness.origin);
    const reports: HeadlessPageReport[] = [];
    for (const input of pages.slice(0, LIMITS.pages)) {
      reports.push(await reportPage(driver, input));
    }
    return { ok: true, pages: reports, omittedPages: Math.max(0, pages.length - LIMITS.pages) };
  } catch (err) {
    return { ok: false, problems: [`The headless preview could not be run: ${messageOf(err)}`] };
  } finally {
    await harness?.close();
    await browser.close();
  }
}

/** The whole action: work out what this repository would publish, then run it.
 *
 *  The projection comes from `previewSharedApp`, which is what the pane asks too — so what runs
 *  here is what the author would see there, and neither is a rehearsal of the other. */
export async function headlessPreview(root: string): Promise<HeadlessRun> {
  const preview = await previewSharedApp(root);
  if (!preview.ok) return { ok: false, problems: preview.problems };
  if (preview.pages.length === 0) {
    return {
      ok: false,
      problems: [
        preview.generatedForm
          ? "This app publishes a GENERATED form rather than a page of its own, and there is no authored document to run. Its inputs come from the declaration — check them in the Collections pane."
          : "This app declares no views, so there is no page to run.",
      ],
    };
  }
  const inputs = preview.pages.map((page): HeadlessPageInput => ({
    id: page.id,
    audience: page.audience,
    html: page.html,
    datasets: preview.datasets[previewPageKey(page.audience, page.id)] ?? {},
    submit: Object.keys(preview.submit).length > 0 ? preview.submit : null,
  }));
  return runPagesHeadless(inputs);
}
