// A cursor session's own record of itself: the per-directory chat list the launcher's "or resume
// here" offers, and the existence probe the survivor guard asks.
//
// Cursor keeps chats under `~/.cursor/projects/<slug>/agent-transcripts/<chatId>/<chatId>.jsonl`,
// where `<slug>` is derived from the working directory — and NOT derivably: long paths are
// truncated and suffixed with a hash (`…-mulmotermina-e83f160`), so reconstructing one from a cwd
// means reimplementing an undocumented rule that will rot. The directory records its own path
// instead, in `.workspace-trusted`, and that file is what this module reads.
//
// It is not written for every project directory — measured, the three directories with no chats had
// none — but every directory that HAD chats had one. That correlation is what makes this safe
// rather than merely convenient: a project directory we cannot attribute is OMITTED, so the failure
// mode is "nothing to resume here", never another directory's conversations.
//
// CURSOR ITSELF SCOPES CHATS BY DIRECTORY. Measured: resuming a chat id belonging to another
// directory starts an EMPTY conversation rather than that directory's — asked what shell command it
// had been given earlier, it answered that this was the first message. So the cwd-bound probe below
// is defence in depth rather than the only thing standing between a hand-edited `?session=` and
// another project's history, which is what it is for copilot.
import { closeSync, existsSync, openSync, readdirSync, readFileSync, readSync, statSync } from "node:fs";
import path from "node:path";
import { isRecord } from "../../common/isRecord.js";
import { readString } from "../../common/readString.js";
import { cursorHome } from "./cursor-hooks-file.js";

const projectsRoot = (home: string): string => path.join(home, "projects");
const transcriptsDir = (project: string): string => path.join(project, "agent-transcripts");

/** Directory names under `projects/`, or [] when cursor has never run here. */
function projectDirs(home: string): string[] {
  try {
    return readdirSync(projectsRoot(home), { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => path.join(projectsRoot(home), entry.name));
  } catch {
    return [];
  }
}

/** The real working directory a project directory stands for, or null when it does not say. */
function workspaceOf(project: string): string | null {
  try {
    const raw: unknown = JSON.parse(readFileSync(path.join(project, ".workspace-trusted"), "utf8"));
    return isRecord(raw) ? readString(raw.workspacePath) || null : null;
  } catch {
    return null;
  }
}

/** EVERY project directory that records this cwd, not the first.
 *
 *  `.find()` was wrong for a reason that is invisible when it happens: cursor's directory name is a
 *  truncated-and-hashed slug, so more than one can name the same workspace — and the first one
 *  found is not necessarily the one holding the chats. An empty duplicate would then hide a real
 *  conversation from BOTH the listing and the resume probe, and the symptom is a cell that quietly
 *  starts a new chat instead of resuming (Codex round 2 of #2065, P2). */
function projectsForCwd(cwd: string, home: string): string[] {
  return projectDirs(home).filter((project) => workspaceOf(project) === cwd);
}

/** Is there a cursor chat by this id ANYWHERE on this machine? The survivor guard's question, and
 *  deliberately a different one from the resume probe below: the guard asks "what wrote this key"
 *  about a session that outlived a server restart, and the request that reattaches one often
 *  carries no cwd to check against. */
export function cursorSessionExists(id: string, home: string = cursorHome()): boolean {
  return projectDirs(home).some((project) => existsSync(path.join(transcriptsDir(project), id)));
}

/** May a connection in `cwd` RESUME this id? Bound to the directory, as grok's and copilot's probes
 *  are. */
export function cursorSessionExistsForCwd(id: string, cwd: string, home: string = cursorHome()): boolean {
  return projectsForCwd(cwd, home).some((project) => existsSync(path.join(transcriptsDir(project), id)));
}

export interface CursorSessionMeta {
  id: string;
  /** The first thing the user said, which is the only summary cursor keeps on disk. */
  title: string;
  mtimeMs: number;
}

// The transcript is a conversation and has no bound, so only its head is read — enough for the
// first record, never the whole file (docs/large-file-reading.md).
const TITLE_SCAN_BYTES = 4096;

/** The first user message in a transcript, or "". Its shape, measured: one JSON object per line,
 *  `{"role":"user","message":{"content":[{"type":"text","text":"…"}]}}`, and the text is wrapped in
 *  `<user_query>` tags after a `<timestamp>` block that cursor prepends. */
export function cursorTranscriptTitle(head: string): string {
  const line = head.split("\n").find((candidate) => candidate.trim().length > 0);
  if (!line) return "";
  try {
    const raw: unknown = JSON.parse(line);
    if (!isRecord(raw) || raw.role !== "user" || !isRecord(raw.message)) return "";
    const content: unknown = raw.message.content;
    if (!Array.isArray(content)) return "";
    const parts: unknown[] = content;
    const first = parts.find((part) => isRecord(part) && readString(part.text) !== "");
    const text = isRecord(first) ? readString(first.text) : "";
    // Non-greedy, and with no `\s*` on either side of the capture: those turn the group into a
    // backtracking hazard on a long line, for a trim `.trim()` already does.
    const query = /<user_query>([\s\S]*?)<\/user_query>/.exec(text);
    return (query?.[1] ?? text).trim();
  } catch {
    return "";
  }
}

function readTitle(file: string): string {
  let fd: number | null = null;
  try {
    fd = openSync(file, "r");
    const buffer = Buffer.alloc(TITLE_SCAN_BYTES);
    // A bounded read, not readFileSync: a transcript is a whole conversation and grows without
    // limit, and only its first line is wanted. The last line in the window is very likely
    // truncated, which is why cursorTranscriptTitle only ever looks at the first.
    const read = readSync(fd, buffer, 0, TITLE_SCAN_BYTES, 0);
    return cursorTranscriptTitle(buffer.subarray(0, read).toString("utf8"));
  } catch {
    return "";
  } finally {
    if (fd !== null) {
      try {
        closeSync(fd);
      } catch {
        // Nothing the caller can do; the title is already decided.
      }
    }
  }
}

/** The chat ids recorded under a project directory. */
function chatIds(root: string): string[] {
  try {
    return readdirSync(root, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);
  } catch {
    return [];
  }
}

export function listCursorSessionsForCwd(cwd: string, home: string = cursorHome()): CursorSessionMeta[] {
  const seen = new Set<string>();
  return projectsForCwd(cwd, home).flatMap((project) => {
    const root = transcriptsDir(project);
    return chatIds(root)
      .map((id) => {
        // A chat id is cursor's own uuid, so the same one appearing under two project directories
        // for this cwd is one conversation, not two rows.
        if (seen.has(id)) return null;
        const file = path.join(root, id, `${id}.jsonl`);
        try {
          const meta = { id, title: readTitle(file), mtimeMs: statSync(file).mtimeMs };
          seen.add(id);
          return meta;
        } catch {
          return null; // a chat directory with no transcript yet
        }
      })
      .filter((meta): meta is CursorSessionMeta => meta !== null);
  });
}
