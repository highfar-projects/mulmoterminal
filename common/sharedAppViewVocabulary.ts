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

/** What a page is told when it asks for a write and the parent that answered performs none.
 *
 *  `transition`, `assign` and `withdraw` reach the parent, which judges them. The pane PERFORMS
 *  them (`server/backends/sharedApp/previewIntent.ts`); a headless run has nowhere to write and
 *  answers `read-only`, which is a GOOD outcome and has to read like one: the ask arrived, in the
 *  right shape, and was declined for the reason that run declines every write.
 *
 *  It said "a member or participant page" until a public page could move its own rows too. */
const READ_ONLY_PARENT =
  "the parent that answered performs nothing, so it declined. The ask itself was well formed and reached the parent — this line means the control is wired, not that " +
  "anything is wrong. It is what a HEADLESS run says: that one loads the page and writes nothing at all. The Collections pane does perform these, as the author, and " +
  "reports what the deployed rules said.";

/** What the parent's refusals mean — every one of them, in ONE map.
 *
 *  None of these ever reaches a screen: they are answered on the port, into a promise the page
 *  usually does not await. So this is the only place an author can learn that the page asked for
 *  something the declaration does not allow — and the page, meanwhile, showed whatever it shows
 *  when nothing comes back.
 *
 *  IT WAS TWO MAPS, chosen by the audience of the page that asked: a public page's refusals were
 *  read as submissions and a member's as intents. That held while the two ran under different
 *  parents, and there is one parent now — a public page moves its own rows (`selfTransitions`,
 *  `selfDelete`) and a member's page submits — so the audience says nothing about which kind of ask
 *  was refused. Splitting on it printed `illegal-transition` raw, on the one page whose visitors
 *  meet it most.
 *
 *  The kind of ask is not carried instead, because it need not be: only `unknown-collection`
 *  collides, and it is answered by naming BOTH declarations rather than by guessing which the
 *  reader meant. Every other name belongs to one kind of ask and reads correctly wherever it lands.
 *
 *  The names are the package's (`IntentRefusal`, and the submit path's) except `no-such-page` and
 *  `not-in-view`, which are this host's: a preview can be asked about a page the author has since
 *  renamed, and the pane writes as the app's OWNER. */
export const REFUSALS: Record<string, string> = {
  "unknown-collection":
    "the page named a collection that is not declared for it — for a submission that is this app's `public.submit`, and for a move it is the `collections` of the " +
    "page's own view. Add it to whichever of the two the button belongs to",
  "undeclared-field": "the page sent a field that is not in that collection's `createFields`",
  "not-a-submission":
    "the message was not a submission at all — most often a value that is not a string (the rules compare stored values without coercing, so only strings may be sent)",
  busy: "a confirmation was already open (the page submitted twice)",
  cancelled: "the confirmation was declined",
  "read-only": READ_ONLY_PARENT,
  "not-writable":
    "nothing of that kind is writable on this page: no `statusField` and `transitions` for a transition, no `assigneeField` for an assignment, no `selfDelete` for a withdrawal",
  "illegal-transition": "the declared `transitions` table does not carry that move from the status the record is in",
  "unknown-assignee": "nobody on the roster holds an assignable role at that address — writing it would produce a row NOBODY may touch afterwards",
  "not-permitted":
    "this reader may not make that move. Being handed the page is not permission: on a member's page the roles decide and yours do not carry this one, and on a " +
    "public page the move has to be declared in `public.submit`, as a `selfTransitions` entry or a `selfDelete`",
  "not-an-intent":
    "the message reached the parent but was not an intent it could read — most often a `withdraw` carrying a `to`, or a missing `cid` / `itemId`",
  "not-in-view":
    "the row is not among the records this page was handed, nor among the author's own. The preview writes as the app's OWNER, so the rules cannot refuse somebody " +
    "else's row the way they would for the person the page was built for — so the pane requires the page to actually hold the row. If the row does exist, the " +
    "pane's records are stale: reopen it",
  "no-such-page": "the page that asked is no longer in the projection — `app.json` changed under a document that is still on screen. Reload the pane",
};

/** One refusal, in the words that fit it.
 *
 *  NO SECOND ARGUMENT. It took the audience of the page that asked, which is how one of the two
 *  maps above was chosen — and the audience decided nothing else about a refusal. */
export const explainRefusal = (reason: string): string => REFUSALS[reason] ?? reason;

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
