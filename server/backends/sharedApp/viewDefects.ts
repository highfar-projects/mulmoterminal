// The two things a view does that the SANDBOX eats silently, beside the modals in `modalCall.ts`.
//
// Same failure shape as those, and the same answer: the browser neither throws nor draws anything,
// so the only sign is a console line the author is not looking at — and the page looks finished.
// Both of these shipped in one real app (a lunch sign-up, published TWICE before anybody pressed
// the button), and both were found by building a copy of the parent page by hand.
//
//   A `<form>` CANNOT SUBMIT. The frame is `sandbox="allow-scripts"` with no `allow-forms`, and
//   Chrome blocks the submission BEFORE firing the `submit` event — so an `onsubmit` handler with
//   `e.preventDefault()` as its first line never runs at all. The console says "Blocked form
//   submission to '' because the form's frame is sandboxed and the 'allow-forms' permission is not
//   set", and the page shows a Submit button that does nothing. The same block takes Enter-in-a-
//   text-field with it, and `required` — constraint validation is part of form submission.
//
//   A VIEW THAT NEVER SAYS `ready()` IS NEVER SENT ANYTHING. The parent holds its data until the
//   view answers the handshake, so a page that registers `onState` and does not call `ready` waits
//   forever on data that was never sent. It renders its loading state and stays there.
//
// Warnings, not refusals, for the reason `viewWarnings` gives: this reads HTML and JavaScript with
// something that is not a parser for either, and a refusal an author cannot act on is the more
// expensive way to be wrong.
import { viewScriptCode, withoutScriptBodies } from "./modalCall.js";

/** A `<form>` START TAG in markup the browser will draw.
 *
 *  Read off the page with every script body and raw-text element CONTENT already gone — a
 *  `<form>` inside a `<textarea>` showing an example draws nothing, and one written in a string is
 *  not markup — and with comments dropped, since a widget commented out while it was being written
 *  is ordinary.
 *
 *  Any `<form>` is reported, including one used only for layout. That is deliberate: it is the
 *  ELEMENT that carries implicit submission, so a `<div>` with a `type="button"` is the shape that
 *  works, and there is no `<form>` here whose submission the sandbox permits. */
const FORM_START_TAG = /<form[\s/>]/i;
const COMMENT = /<!--[\s\S]*?(?:-->|$)/g;

export const formElementIn = (html: string): boolean => FORM_START_TAG.test(withoutScriptBodies(html).replace(COMMENT, " "));

/** Asking for state — `onState(…)` — with the handshake it depends on nowhere in the page.
 *
 *  Only ever reported TOGETHER: a page with neither is a static view that wants no data, and
 *  warning at it would be warning at something that works. A page calling `ready` without
 *  `onState` is odd but harmless, so it is left alone too.
 *
 *  Read off the page's code with strings and comments removed, so the word appearing in prose or
 *  in a message the page shows is not mistaken for the call. */
const ON_STATE = /\.\s*onState\s*\(/;
const READY = /\.\s*ready\s*\(/;

export const readyNeverCalled = (html: string): boolean => {
  const code = viewScriptCode(html);
  return ON_STATE.test(code) && !READY.test(code);
};
