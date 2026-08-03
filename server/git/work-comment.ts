// Leaving MulmoTerminal's work comment on an issue (#979 Phase 2, #1369).
//
// The caller asks for a STATE ("this milestone should be recorded"), not an action, because the
// client that asks is a poll: it re-asks on every tick, from every open tab, and again after a
// reload. So the only correctness property that matters here is that asking twice writes once.
//
// Two layers give that. A process memo answers the repeat asks for free, and the issue's own
// comments are the source of truth for a fresh process — the marker is in the thread and the
// milestones are in the comment body, so a restarted server, a second instance, or a second
// browser cannot double-post.
//
// There is ONE comment per (issue, clone): the first milestone posts it, every later one edits it.
// That keeps a busy issue readable, and it is why the body has to be parsed back before it is
// rewritten — the comment is the only place the earlier milestones are stored.
import { runGh } from "./gh.js";
import {
  runGlab,
  glabIssueCloseArgs,
  glabIssueNoteArgs,
  glabIssueNoteEditArgs,
  glabIssueNotesArgs,
  glabIssueViewArgs,
  glabTarget,
  type GlabTarget,
} from "./glab.js";
import { glabIssueIsOpen, glabNotes } from "./glab-items.js";
import { forgeFromRepoEntry, projectPath, GITHUB_HOST } from "./forge-host.js";
import { createKeySerializer } from "../infra/serialize-per-key.js";
import { isRecord } from "../../common/isRecord.js";
import {
  alreadyCommented,
  formatWorkTime,
  parseWorkEvents,
  renderWorkComment,
  withWorkEvent,
  workAnchorMarker,
  type WorkCommentKind,
  type WorkEvent,
} from "../../common/workComment.js";

export interface WorkCommentDeps {
  runGh?: typeof runGh;
  /** The clock the milestone is stamped with, injectable so a spec can pin the line it writes. */
  now?: () => Date;
}

export interface WorkCommentResult {
  /** The issue was written to — a new comment, or an edit to the one this clone already has. */
  posted: boolean;
  // Why nothing was written, for the caller's log and the route's response. Never an error the
  // UI must handle: not commenting is a normal outcome.
  reason?: "already" | "gh-failed";
  closed?: boolean;
}

// (repo, issue, kind, dir, pr) that this process has already written or found. Never expires: the
// answer cannot become false — a milestone is not unrecorded — and the set is bounded by the number
// of issues a session works on.
const posted = new Set<string>();

// The memo above only closes the door AFTER a write lands. Two polls arriving together — which is
// the normal case with several tabs open — both find it open, both read the issue, and both post
// (found by Codex review).
//
// Keyed by the COMMENT, not by the milestone, because recording one is a read-modify-write: the
// body is where the earlier milestones live, so two runs editing it at once would each render from
// the body they read and the second would drop the first's line. Serializing per comment covers
// both — a queued caller re-reads the memo and the thread, and usually finds there is nothing left
// to do.
const serializePerComment = createKeySerializer();

// The PR is part of the key, not just the kind: a second pull request for the same issue from the
// same clone is a milestone of its own, and a key that ignored the number would swallow it.
const memoKey = (repo: string, issue: number, kind: WorkCommentKind, dir: string, pr: number | null) => `${repo}#${issue}:${kind}:${pr ?? ""}:${dir}`;

// The one comment a clone maintains on an issue — what the lock above is taken on.
const commentKey = (repo: string, issue: number, dir: string) => `${repo}#${issue}:${dir}`;

// Test-only: the memo outlives a single case otherwise, and "already posted" would leak across.
export function clearWorkCommentMemo(): void {
  posted.clear();
}

/** A comment as this module needs it: what it says, how to address an edit to it, and when it was
 *  written — the last of which is the start time for a comment posted before milestones existed. */
interface IssueComment {
  body: string;
  /** Null when the forge gave no id to edit by; such a comment can be read but not updated. */
  ref: string | null;
  createdAt: string | null;
}

interface IssueView {
  comments: IssueComment[];
  open: boolean;
}

// Reading and writing one forge's issue. Grouped rather than branched at each call site: they
// always belong to the same host, and a mix would read one issue and write another.
interface IssueOps {
  view: () => Promise<IssueView | null>;
  comment: (body: string) => Promise<boolean>;
  edit: (ref: string, body: string) => Promise<boolean>;
  close: () => Promise<boolean>;
}

const ranOk = async (call: Promise<{ ok: boolean }>): Promise<boolean> => (await call.catch(() => null))?.ok === true;

// The numeric id the REST API edits by. `--json comments` hands back a GraphQL node id, which that
// endpoint does not accept — the number is only in the comment's own URL.
const COMMENT_ID = /#issuecomment-(\d+)$/;

const githubCommentRef = (url: unknown): string | null => (typeof url === "string" ? (COMMENT_ID.exec(url)?.[1] ?? null) : null);

const textOrNull = (v: unknown): string | null => (typeof v === "string" && v !== "" ? v : null);

function githubComments(parsed: Record<string, unknown>): IssueComment[] {
  const comments = Array.isArray(parsed.comments) ? parsed.comments : [];
  return comments.filter(isRecord).map((c) => ({
    body: typeof c.body === "string" ? c.body : "",
    ref: githubCommentRef(c.url),
    createdAt: textOrNull(c.createdAt),
  }));
}

// `gh api` is addressed by hostname and bare `owner/repo`, unlike every other call here, which
// takes the configured entry whole through `--repo`. A GitHub Enterprise entry carries its host in
// that string, and leaving it in the path would ask github.com about a repository named after a
// server (Codex would call this the same bug as #1332's `--repo` URL).
function githubApiTarget(repo: string): { host: string; project: string } {
  const forge = forgeFromRepoEntry(repo);
  if (!forge) return { host: GITHUB_HOST, project: repo };
  return { host: forge.host, project: projectPath(forge) ?? forge.path };
}

function githubIssueOps(run: typeof runGh, repo: string, issue: number): IssueOps {
  return {
    view: async () => {
      try {
        const res = await run(["issue", "view", String(issue), "--repo", repo, "--json", "comments,state"]);
        if (!res.ok) return null;
        const parsed: unknown = JSON.parse(res.stdout);
        if (!isRecord(parsed)) return null;
        return { comments: githubComments(parsed), open: parsed.state === "OPEN" };
      } catch {
        return null;
      }
    },
    comment: (body) => ranOk(run(["issue", "comment", String(issue), "--repo", repo, "--body", body])),
    edit: (ref, body) => {
      const { host, project } = githubApiTarget(repo);
      // `-f`, not `-F`: the typed flag reads `@…` as a filename and converts bare true/false/null,
      // neither of which is this app's decision to make about a comment body.
      return ranOk(run(["api", "--hostname", host, "--method", "PATCH", `repos/${project}/issues/comments/${ref}`, "-f", `body=${body}`]));
    },
    close: () => ranOk(run(["issue", "close", String(issue), "--repo", repo])),
  };
}

// TWO calls where GitHub needs one: `glab issue view -F json` carries no comments at all (and
// `--comments` only changes the human-readable output), so the notes come from the REST endpoint
// while the state comes from the view. Measured, not assumed.
function gitlabIssueOps(target: GlabTarget, issue: number): IssueOps {
  return {
    view: async () => {
      try {
        const [notes, view] = await Promise.all([runGlab(glabIssueNotesArgs(target, issue)), runGlab(glabIssueViewArgs(target, issue))]);
        if (!notes.ok || !view.ok) return null;
        const comments = glabNotes(JSON.parse(notes.stdout)).map((note) => ({ body: note.body, ref: note.id, createdAt: note.createdAt }));
        return { comments, open: glabIssueIsOpen(JSON.parse(view.stdout)) };
      } catch {
        return null;
      }
    },
    comment: (body) => ranOk(runGlab(glabIssueNoteArgs(target, issue, body))),
    edit: (ref, body) => ranOk(runGlab(glabIssueNoteEditArgs(target, issue, ref, body))),
    close: () => ranOk(runGlab(glabIssueCloseArgs(target, issue))),
  };
}

// `runGh` is injected by the specs, so the GitHub path keeps taking it; the GitLab path has no such
// seam yet and its pure parts are tested directly instead.
function issueOpsFor(run: typeof runGh, repo: string, issue: number): IssueOps {
  const forge = forgeFromRepoEntry(repo);
  if (forge?.kind !== "gitlab") return githubIssueOps(run, repo, issue);
  return gitlabIssueOps(glabTarget(forge), issue);
}

/**
 * Make sure `kind`'s milestone is recorded on `issue`, once. `closeIssue` additionally closes a
 * still-open issue — used for the merged milestone, where GitHub has usually already closed it via
 * the PR's `Fixes #N`, so this only covers the PRs that didn't say it.
 */
export function ensureWorkComment(
  repo: string,
  issue: number,
  kind: WorkCommentKind,
  dir: string,
  pr: number | null,
  options: { closeIssue?: boolean } & WorkCommentDeps = {},
): Promise<WorkCommentResult> {
  const key = memoKey(repo, issue, kind, dir, pr);
  if (posted.has(key)) return Promise.resolve({ posted: false, reason: "already" });

  return serializePerComment(commentKey(repo, issue, dir), () => {
    // Re-read after the wait: the run this one queued behind may have been the same milestone, in
    // which case there is nothing to say and no reason to ask the forge again.
    if (posted.has(key)) return Promise.resolve({ posted: false, reason: "already" });
    return writeWorkComment(repo, issue, kind, dir, pr, options);
  });
}

// What this clone's comment already records. A comment written before milestones existed carries
// the marker and the headline but no lines, and its own creation time is the honest answer for
// when the work started — dropping it would rewrite history as if the work began at the next
// milestone.
function knownEvents(anchor: IssueComment): WorkEvent[] {
  const parsed = parseWorkEvents(anchor.body);
  if (parsed.length > 0) return parsed;
  const at = anchor.createdAt === null ? null : new Date(anchor.createdAt);
  return at && !Number.isNaN(at.getTime()) ? [{ kind: "start", at: formatWorkTime(at), pr: null }] : [];
}

async function writeWorkComment(
  repo: string,
  issue: number,
  kind: WorkCommentKind,
  dir: string,
  pr: number | null,
  options: { closeIssue?: boolean } & WorkCommentDeps,
): Promise<WorkCommentResult> {
  const run = options.runGh ?? runGh;
  const key = memoKey(repo, issue, kind, dir, pr);

  const ops = issueOpsFor(run, repo, issue);
  const view = await ops.view();
  if (!view) return { posted: false, reason: "gh-failed" };

  const anchor = view.comments.find((c) => c.body.includes(workAnchorMarker(dir))) ?? null;
  const known = anchor ? knownEvents(anchor) : [];
  const next = withWorkEvent(known, { kind, at: formatWorkTime(options.now?.() ?? new Date()), pr });
  // A merge announced by an older build lives in a SECOND comment with its own marker, which the
  // events above cannot see. Without this the same merge would be stated twice on an issue that
  // was already in flight when the app was upgraded.
  const bodies = view.comments.map((comment) => comment.body);
  const legacyMerged = kind === "merged" && alreadyCommented(bodies, "merged", dir);
  if (next === null || legacyMerged) {
    posted.add(key);
    return { posted: false, reason: "already" };
  }

  const body = renderWorkComment(dir, next);
  // An anchor with no ref cannot be edited — reported as a failure rather than remembered, so a
  // later milestone tries again instead of the issue silently freezing on its first line.
  const wrote = anchor ? anchor.ref !== null && (await ops.edit(anchor.ref, body)) : await ops.comment(body);
  if (!wrote) return { posted: false, reason: "gh-failed" };
  posted.add(key);

  // Closing is best-effort and reported separately: the comment landing is the part that matters,
  // and a repo where the user cannot close issues must not turn into a failed request.
  if (options.closeIssue && view.open) {
    return { posted: true, closed: await ops.close() };
  }
  return { posted: true, closed: false };
}
