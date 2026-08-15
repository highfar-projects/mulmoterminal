// A headless run, in words an agent can act on.
//
// Its own module and not part of the run, so that what is SAID about a page can be tested without
// starting a browser — the run itself needs one, and a test that needs Chrome to check a sentence
// is a test nobody runs.
//
// The register is deliberate. Every line answers "what would a person have seen, and what do you
// do about it": a page stuck on its loading state is reported with the words that are on it, and a
// button that reached nothing is named. What must never appear here is a verdict — a run that goes
// well says the pages drew and the presses arrived, and it does NOT say the app is ready to
// publish. Four kinds of failure survive this (the rules, other people's devices, two people at
// once, and whether the rules are deployed at all), which is why the closing lines are fixed text
// rather than something a good run can omit.
import { LIMITS, type HeadlessPageReport, type HeadlessPress, type HeadlessRun } from "./headlessPreview.js";

/** What the parent's own refusals mean. These never reach a browser's screen: they are answered on
 *  the port, into a promise the page usually does not await, so this is the only place an author
 *  can learn the page asked for something the declaration does not allow. */
const REFUSALS: Record<string, string> = {
  "unknown-collection": "the page submitted to a collection this app's `public.submit` does not declare",
  "undeclared-field": "the page sent a field that is not in that collection's `createFields`",
  "not-a-submission":
    "the message was not a submission at all — most often a value that is not a string (the rules compare stored values without coercing, so only strings may be sent)",
  busy: "a confirmation was already open (the page submitted twice)",
};

const quoted = (text: string): string => `"${text}"`;

/** The handshake, which decides whether anything below it is about a page that has its data. */
function handshakeLine(page: HeadlessPageReport): string {
  if (!page.readied) {
    return (
      "It NEVER answered the handshake, so the parent sent it no records at all — this is the page that sits on its loading state forever. " +
      "`ready()` has to be called OUTSIDE the `onState` callback: inside it, it can never run, because the parent sends no state until `ready` arrives."
    );
  }
  if (!page.stateDelivered) return "It answered the handshake, but no records were sent — this app declares no datasets for this page.";
  return "It answered the handshake and was sent its records.";
}

function formLine(page: HeadlessPageReport): string[] {
  if (page.liveForms === 0) return [];
  return [
    `The live document has ${page.liveForms} <form> element${page.liveForms === 1 ? "" : "s"}. A form cannot submit here: the frame is sandboxed without \`allow-forms\`, ` +
      "and the browser blocks the submission BEFORE firing the `submit` event — so an `onsubmit` handler with `e.preventDefault()` as its first line never runs. " +
      'Use a `<div>` with a `type="button"` button and a click handler.',
  ];
}

function pressLine(press: HeadlessPress): string[] {
  const head = `Pressed ${quoted(press.label)}: `;
  const extra = press.errors.length === 0 ? [] : [`    It also raised: ${press.errors.join(" / ")}`];
  if (press.submitted !== null) {
    const fields = press.submitted.fields.length === 0 ? "no fields" : press.submitted.fields.join(", ");
    return [
      `  ${head}a submission reached the parent for '${press.submitted.cid}' carrying ${fields}. It was DECLINED — a headless run never writes.`,
      ...extra,
    ];
  }
  if (press.refused.length > 0) {
    const why = press.refused.map((reason) => REFUSALS[reason] ?? reason).join("; ");
    return [`  ${head}the parent REFUSED it — ${why}. The page cannot see this: the refusal is answered on the port, not on the screen.`, ...extra];
  }
  if (press.blockedFormSubmission) {
    return [
      `  ${head}nothing reached the parent, and the browser BLOCKED a form submission. This is the button that looks finished and does nothing.`,
      ...extra,
    ];
  }
  return [
    `  ${head}nothing reached the parent. If it was meant to submit, it is a dead button; if it only changes what is on screen, that is fine and this line is expected.`,
    ...extra,
  ];
}

function pageLines(page: HeadlessPageReport): string[] {
  // A cap that is not said out loud reads as "everything was covered".
  const capped = page.presses.length === LIMITS.presses ? [`  (only the first ${LIMITS.presses} controls were pressed)`] : [];
  return [
    "",
    `${page.audience} page '${page.id}'`,
    `  ${handshakeLine(page)}`,
    ...formLine(page).map((line) => `  ${line}`),
    page.text === "" ? "  Nothing was drawn: the page put no text on the screen at all." : `  On screen: ${quoted(page.text)}`,
    ...(page.presses.length === 0 ? ["  No button or clickable control was found on this page."] : page.presses.flatMap(pressLine)),
    ...capped,
    ...(page.errors.length === 0 ? [] : [`  The browser reported: ${page.errors.join(" / ")}`]),
  ];
}

/** The fixed close. Not omitted on a clean run, and not softened: the run proves the drawing and
 *  the wiring, and the four things it hides are the ones that only appear after publishing. */
const CLOSING = [
  "",
  "Nothing was written: every confirmation was declined, so no record reached the database.",
  "This does NOT prove the app is ready to publish. It says nothing about whether the deployed rules would accept a write, about other people's devices, " +
    "about two people submitting at once, or about whether the rules are deployed at all. For the write, ask the user to press Preview in the Collections pane — " +
    "that one accepts, as them, against the real rules.",
];

export function narrateHeadlessRun(run: HeadlessRun): string {
  if (!run.ok) return run.problems.join("\n");
  const count = run.pages.length;
  return [
    `Ran ${count} page${count === 1 ? "" : "s"} in a real browser, in the same sandbox and CSP a visitor gets.`,
    ...run.pages.flatMap(pageLines),
    ...CLOSING,
  ].join("\n");
}
