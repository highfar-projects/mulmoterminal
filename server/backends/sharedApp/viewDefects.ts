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

/** Asking for state — `onState(…)` — with no `ready()` the page can actually REACH.
 *
 *  Not merely "the word is absent". `ready()` written INSIDE the `onState` callback deadlocks in
 *  exactly the same way and is the likelier mistake, because it is what "call `ready` after
 *  registering the listener" sounds like:
 *
 *      view.onState((data) => { draw(data); view.ready(); });   // ← never runs
 *
 *  The parent sends no state until `ready` arrives, so the callback never fires, so `ready` is
 *  never sent. A check that only asked whether the name appears called that page clean.
 *
 *  So the `onState` ARGUMENTS are cut out of the code first, and what is looked at is the call
 *  that survives. Only ever reported together with an `onState`: a page with neither is a static
 *  view that wants no data, and warning at it would be warning at something that works.
 *
 *  Read off the page's code with strings and comments removed, so the word appearing in prose or
 *  in a message the page shows is not mistaken for the call. */
const ON_STATE = /\.\s*onState\s*\(/g;
const READY = /\.\s*ready\s*\(/;

/** Where the argument list opened at `from` (the index OF its `(`) ends, or the end of the code
 *  for an unbalanced one — which is what a browser would run to as well. Strings and comments are
 *  already gone, so a parenthesis here is a parenthesis. */
const closingParen = (code: string, from: number): number => {
  let depth = 0;
  for (let i = from; i < code.length; i += 1) {
    if (code[i] === "(") depth += 1;
    else if (code[i] === ")") {
      depth -= 1;
      if (depth === 0) return i + 1;
    }
  }
  return code.length;
};

/** The page's code with every `onState(…)` argument list removed — so a `ready()` that is only
 *  reachable from inside the listener is not there to find.
 *
 *  The matches are passed IN rather than found here: `ON_STATE` is global, and a `test()` on a
 *  global regex leaves `lastIndex` past the match — which a later `matchAll` inherits, so the
 *  scan found nothing and every page looked as if it called `ready` outside. Scanning once and
 *  sharing the result is the fix and also the only reading of it that cannot drift. */
const outsideOnState = (code: string, listeners: readonly RegExpMatchArray[]): string => {
  let out = "";
  let cursor = 0;
  for (const hit of listeners) {
    const open = (hit.index ?? 0) + hit[0].length - 1;
    if (open < cursor) continue;
    out += code.slice(cursor, open);
    cursor = closingParen(code, open);
  }
  return out + code.slice(cursor);
};

export const readyNeverCalled = (html: string): boolean => {
  const code = viewScriptCode(html);
  const listeners = [...code.matchAll(ON_STATE)];
  return listeners.length > 0 && !READY.test(outsideOnState(code, listeners));
};
