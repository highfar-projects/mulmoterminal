// @vitest-environment node
//
// What a headless run SAYS, tested without a browser.
//
// Separate from the contract test beside it for a reason that is not tidiness: the run needs
// Chrome and is skipped where there is none, so every assertion about the words would be skipped
// with it — and the words are what the agent acts on. A page that never answered the handshake is
// only useful if the report says which line of the author's page to move.
import { describe, expect, it } from "vitest";
import { narrateHeadlessRun } from "../../../server/backends/sharedApp/headlessReport.js";
import type { HeadlessPageReport, HeadlessPress } from "../../../server/backends/sharedApp/headlessPreview.js";

const press = (over: Partial<HeadlessPress> = {}): HeadlessPress => ({
  label: "Order",
  notClickable: false,
  submitted: null,
  refused: [],
  blockedFormSubmission: false,
  errors: [],
  ...over,
});

const page = (over: Partial<HeadlessPageReport> = {}): HeadlessPageReport => ({
  id: "public",
  audience: "public",
  readied: true,
  stateDelivered: true,
  liveForms: 0,
  text: "Curry, Ramen",
  presses: [],
  errors: [],
  ...over,
});

const narrate = (over: Partial<HeadlessPageReport> = {}, omittedPages = 0): string => narrateHeadlessRun({ ok: true, pages: [page(over)], omittedPages });

describe("narrateHeadlessRun", () => {
  it("names the fix for a page that never answered the handshake", () => {
    // The whole value of the line: "loading forever" is a symptom with exactly one cause here, and
    // the report has to say where `ready()` goes rather than that something went wrong.
    const said = narrate({ readied: false, stateDelivered: false, text: "loading…" });
    expect(said).toContain("NEVER answered the handshake");
    expect(said).toContain("OUTSIDE the `onState` callback");
    expect(said).toContain('"loading…"');
  });

  it("explains a live form as the sandbox blocking it, not as a style preference", () => {
    const said = narrate({ liveForms: 2 });
    expect(said).toContain("2 <form> elements");
    expect(said).toContain("allow-forms");
    expect(said).toContain("BEFORE firing the `submit` event");
  });

  it("reports a press that reached the parent, and that it was not written", () => {
    const said = narrate({ presses: [press({ submitted: { cid: "orders", fields: ["name"] } })] });
    expect(said).toContain("a submission reached the parent for 'orders' carrying name");
    expect(said).toContain("DECLINED");
  });

  it("translates the parent's own refusals, which never reach a screen", () => {
    const said = narrate({ presses: [press({ refused: ["undeclared-field"] })] });
    expect(said).toContain("not in that collection's `createFields`");
    expect(said).toContain("not on the screen");
  });

  it("calls a dead button dead, without calling a display-only button broken", () => {
    const blocked = narrate({ presses: [press({ blockedFormSubmission: true })] });
    expect(blocked).toContain("BLOCKED a form submission");
    // The same shape of press with no block is genuinely ambiguous, and the report says so rather
    // than reporting a working tab control as a defect.
    const quiet = narrate({ presses: [press()] });
    expect(quiet).toContain("nothing reached the parent");
    expect(quiet).toContain("that is fine");
  });

  it("says what it did not cover, and never says the app is ready to publish", () => {
    // A run that goes perfectly still ends with the four things it hides. A report that could omit
    // them would read as a green light on the one question it cannot answer.
    const clean = narrate({ presses: [press({ submitted: { cid: "orders", fields: [] } })] });
    expect(clean).toContain("Nothing was written");
    expect(clean).toContain("does NOT prove the app is ready to publish");
    expect(clean).toContain("Collections pane");
  });

  it("says a control could not be clicked, rather than calling it a dead button", () => {
    // The two want opposite things done about them: a handler that is not wired up, against a
    // control a visitor's cursor can never arrive at.
    const said = narrate({ presses: [press({ notClickable: true })] });
    expect(said).toContain("HAD NOWHERE TO BE CLICKED");
    expect(said).not.toContain("dead button");
  });

  it("keeps a refusal that happened alongside a successful submission", () => {
    // The half nobody can see. Reported only in the branch that had no submission, the second
    // request's diagnostic would be lost everywhere at once.
    const said = narrate({ presses: [press({ submitted: { cid: "orders", fields: ["name"] }, refused: ["busy"] })] });
    expect(said).toContain("a submission reached the parent");
    expect(said).toContain("also REFUSED");
    expect(said).toContain("confirmation was already open");
  });

  it("says what a member page's run did NOT cover, and does not blame the page for an intent", () => {
    // `transition` / `assign` / `withdraw` are answered by a parent that is not shared code yet
    // (mulmoserver's `AppViewFrame.vue`), so the public parent judging them `not-a-submission` is
    // expected — reading it back as "you sent a value that is not a string" would send an author
    // to rewrite a page that is correct.
    const said = narrate({ audience: "member", presses: [press({ refused: ["not-a-submission"] })] });
    expect(said).toContain("only PART of it is exercised here");
    expect(said).toContain("no `viewer` capabilities");
    expect(said).toContain("expected for `transition`");
    expect(said).not.toContain("most often a value that is not a string");
    // And a PUBLIC page still gets the ordinary translation.
    expect(narrate({ presses: [press({ refused: ["not-a-submission"] })] })).toContain("most often a value that is not a string");
  });

  it("says how many pages it did not run at all", () => {
    // "Ran 6 pages" reads as "ran the app", and the seventh is then published having never been
    // loaded — the exact failure the action exists to end.
    expect(narrate({}, 3)).toContain("3 more pages were NOT run");
    expect(narrate({}, 1)).toContain("1 more page was NOT run");
    expect(narrate({})).not.toContain("NOT run");
  });

  it("passes a failed run through as its problems", () => {
    expect(narrateHeadlessRun({ ok: false, problems: ["no browser", "ask the user"] })).toBe("no browser\nask the user");
  });
});
