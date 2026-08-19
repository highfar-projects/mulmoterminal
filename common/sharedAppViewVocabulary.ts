// What the parent's own words MEAN, in one place, for everything that explains a view to its author.
//
// Two things say these sentences now and they must not say them differently: the headless run an
// agent starts (`server/backends/sharedApp/headlessReport.ts`) and the log an author copies out of
// the Collections pane (`src/utils/sharedAppPreviewLog.ts`). Both are read by the same reader —
// often a language model, sometimes the person — about the same page, and the two arriving in
// different vocabularies would make an author reconcile two accounts of one failure before they
// could start on the failure.
//
// In `common/` because that is what the rule says (CLAUDE.md): a value BOTH sides decide from lives
// here rather than mirrored with a comment asking somebody to keep two copies in step.
//
// These are the explanations. What each host does with them — a per-page report, a timeline — is
// its own, and stays there.
import type { ViewNoticeCode } from "@receptron/sharedapp/view";
import type { PreviewAudience } from "./sharedAppPreview.js";

/** What the parent's refusals mean.
 *
 *  None of these ever reaches a screen: they are answered on the port, into a promise the page
 *  usually does not await. So this is the only place an author can learn that the page asked for
 *  something the declaration does not allow — and the page, meanwhile, showed whatever it shows
 *  when nothing comes back. */
export const REFUSALS: Record<string, string> = {
  "unknown-collection": "the page submitted to a collection this app's `public.submit` does not declare",
  "undeclared-field": "the page sent a field that is not in that collection's `createFields`",
  "not-a-submission":
    "the message was not a submission at all — most often a value that is not a string (the rules compare stored values without coercing, so only strings may be sent)",
  busy: "a confirmation was already open (the page submitted twice)",
  cancelled: "the confirmation was declined",
};

/** What a member or participant page is told when it asks for a write.
 *
 *  `transition`, `assign` and `withdraw` reach the member parent, which judges them. The pane
 *  PERFORMS them (`server/backends/sharedApp/previewIntent.ts`); a headless run has nowhere to
 *  write and answers `read-only`, which is a GOOD outcome and has to read like one: the ask
 *  arrived, in the right shape, and was declined for the reason that run declines every write.
 *
 *  The two hosts said the same thing here until 2026-08-18, and the sentence has been narrowed
 *  rather than deleted: it is still the honest account of the run that does not write. */
export const READ_ONLY_ON_A_MEMBER_PAGE =
  "the parent that answered performs nothing, so it declined. The ask itself was well formed and reached the parent — this line means the control is wired, not that " +
  "anything is wrong. It is what a HEADLESS run says: that one loads the page and writes nothing at all. The Collections pane does perform these, as the author, and " +
  "reports what the deployed rules said.";

/** What a member's or participant's INTENT is told, when the ask was refused before it reached the
 *  database.
 *
 *  Its own map rather than more entries in `REFUSALS`, because the two vocabularies COLLIDE:
 *  `unknown-collection` off a public submission is about `public.submit`, and off an intent it is
 *  about the page's own view. One map would have to pick a wording, and either half of the answer
 *  would then send an author to a declaration that has nothing to do with what they pressed.
 *
 *  These names are the package's (`IntentRefusal`) except the last two, which are this host's — a
 *  preview can be asked about a page the author has since renamed, and the public parent has no
 *  tier to judge a member's move as. */
export const INTENT_REFUSALS: Record<string, string> = {
  "unknown-collection": "the page asked about a collection its own view does not declare — add it to that view's `collections`",
  "not-writable":
    "nothing of that kind is writable on this page: no `statusField` and `transitions` for a transition, no `assigneeField` for an assignment, no `selfDelete` for a withdrawal",
  "illegal-transition": "the declared `transitions` table does not carry that move from the status the record is in",
  "unknown-assignee": "nobody on the roster holds an assignable role at that address — writing it would produce a row NOBODY may touch afterwards",
  "not-permitted": "this reader may not make that move. Being handed the page is not permission: the roles are what decide, and yours do not carry this one",
  "not-an-intent":
    "the message reached the parent but was not an intent it could read — most often a `withdraw` carrying a `to`, or a missing `cid` / `itemId`",
  "not-a-member-page": "an intent arrived from a PUBLIC page, which has no reader and no roles for it to be judged against",
  "no-such-page": "the page that asked is no longer in the projection — `app.json` changed under a document that is still on screen. Reload the pane",
};

/** One refusal, in the words that fit the page it happened on. */
export const explainRefusal = (reason: string, audience: PreviewAudience): string => {
  if (audience === "public") return REFUSALS[reason] ?? reason;
  // A member's page, where an intent is the thing being refused. `read-only` still happens on it —
  // the headless run performs nothing — and it is not a fault, so it keeps its own sentence.
  if (reason === "read-only") return READ_ONLY_ON_A_MEMBER_PAGE;
  return INTENT_REFUSALS[reason] ?? REFUSALS[reason] ?? reason;
};

/** What a page that never answered the handshake is doing, and the one thing that causes it. */
export const READY_DEADLOCK =
  "It NEVER answered the handshake, so the parent sent it no records at all — this is the page that sits on its loading state forever. " +
  "`ready()` has to be called OUTSIDE the `onState` callback: inside it, it can never run, because the parent sends no state until `ready` arrives.";

/** Why a `<form>` is a dead control here, in the words of what the browser actually does. */
export const FORM_BLOCKED =
  "A form cannot submit here: the frame is sandboxed without `allow-forms`, and the browser blocks the submission BEFORE firing the `submit` event — so an " +
  '`onsubmit` handler with `e.preventDefault()` as its first line never runs. Use a `<div>` with a `type="button"` button and a click handler.';

/** What the frame reported about ITSELF, and what to do about each.
 *
 *  The codes come from `@receptron/sharedapp/view`, which normalises anything it does not know to
 *  `unknown` — so this map is over a closed set and an entry that goes missing is a type error
 *  rather than a code printed raw. */
export const NOTICES: Record<ViewNoticeCode, string> = {
  error: "the page raised an error nothing caught. Everything after the throw did not run, which is usually why the screen stopped where it did",
  "unhandled-rejection": "a promise the page made was rejected and nothing handled it. Most often an `await` on a request that was refused",
  "modal-ignored":
    "the page called a modal the sandbox IGNORES. `alert`, `confirm` and `prompt` do nothing here and do nothing on the published page either — `confirm` answers " +
    "false, so the page carries on as though the visitor had said no. Ask with an `<input>`, say things in the page, and confirm by pressing twice",
  "notices-dropped":
    "the page reported more of the above than this runtime carries, and the rest were not sent. The ones above are the earliest, which are usually the cause",
  unknown: "the page reported something under a name this host does not know. The name itself is not repeated here — it is a string the page chose",
};

/** Page-controlled text, put into a report so it cannot be mistaken for the report's own words.
 *
 *  `JSON.stringify` rather than a pair of quotes: a label reading `Save "draft"` or a screen with a
 *  newline in it would otherwise end a quotation early, and the reader — frequently a model being
 *  asked what went wrong — cannot tell a quotation mark the page wrote from one a host did. */
export const quoteForReport = (text: string): string => JSON.stringify(text);
