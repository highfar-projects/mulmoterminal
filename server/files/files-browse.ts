// Project-scoped file browsing + editing for the full-screen Files view. Takes a
// `?cwd=` project dir (the directory a terminal's session runs in) so each terminal
// browses/edits ITS OWN project. list/text/md are read-only GETs; write is a PUT.
//
// Security: the same loopback/trusted-local-user posture as the worktree/session
// endpoints — any absolute existing dir is an allowed base — but `path` is always
// contained within that base (no `..`/absolute escape), for reads AND writes. Rendered
// markdown is served under a sandbox CSP so embedded scripts can't run in the app origin.
import path from "node:path";
import fs from "node:fs";
import { createHash } from "node:crypto";
import { marked } from "marked";
import type { Express, Request, Response } from "express";
import os from "node:os";
import { hasErrnoCode } from "../errors.js";
import { backupCurrentFile, storeBackup } from "./backup-store.js";
import { losslessText } from "./editableText.js";
import { resolveBase, resolveContained } from "./pathContainment.js";
import { listProjectFiles } from "./project-files.js";
import { answered, parseSearchOutput, searchArgv, SEARCH_TIMEOUT_MS } from "./file-search.js";
import { isSearchable, type SearchRequest, type SearchResult } from "../../common/fileSearch.js";
import { git } from "../git/worktrees.js";
import { htmlDoc, jsonHtmlDoc, tableHtmlDoc, delimiterForExtension } from "./renderedDoc.js";
import { requestBody } from "../routes/requestBody.js";

// Cap on the bytes served to the editor / accepted on write — a text editor, not a
// blob store. Large/binary files are refused rather than streamed into a textarea.
export const MAX_EDIT_BYTES = 2 * 1024 * 1024;

/** Wrap marked's HTML output in the shared self-contained document (served sandboxed). */
export const mdToHtmlDoc = (bodyHtml: string, title: string): string => htmlDoc(bodyHtml, title);

export interface BrowseEntry {
  name: string;
  dir: boolean;
  size: number;
}

// A file's version token, handed to the editor with its text and handed back on save so a
// write that would clobber someone else's is refused instead (the agent running in that very
// directory is the someone else). Content, not mtime: a one-second-resolution filesystem or
// two writes inside a clock tick report "unchanged" for exactly the race this guards.
// Computed from raw bytes and never by the client, so a BOM or invalid UTF-8 can't make the
// two sides disagree about what the file is.
const versionOfBytes = (bytes: Buffer): string => createHash("sha256").update(bytes).digest("hex").slice(0, 16);

/** The file's current version, or null when it doesn't exist — which is also what a caller
 *  passes as `baseVersion` to say "I expect to be creating this". ONLY a missing file reads
 *  as null: one that exists but can't be read (permissions, a transient I/O error) must not
 *  answer "absent", or a `baseVersion: null` write would sail past the conflict check and
 *  overwrite it. Anything else throws, and the write fails instead of guessing. */
export function currentVersion(abs: string): string | null {
  try {
    return versionOfBytes(fs.readFileSync(abs));
  } catch (err) {
    if (hasErrnoCode(err) && err.code === "ENOENT") return null;
    throw err;
  }
}

// Directory listing, directories first then files, each alphabetical. Dotfiles are
// kept (a project's config often lives in them) but node_modules/.git are noisy —
// still listed; the UI can collapse them.
export function listEntries(absDir: string): BrowseEntry[] {
  return fs
    .readdirSync(absDir, { withFileTypes: true })
    .map((d) => {
      const dir = d.isDirectory();
      let size = 0;
      if (!dir) {
        try {
          size = fs.statSync(path.join(absDir, d.name)).size;
        } catch {
          size = 0;
        }
      }
      return { name: d.name, dir, size };
    })
    .sort((a, b) => {
      if (a.dir !== b.dir) return a.dir ? -1 : 1; // directories first
      return a.name.localeCompare(b.name);
    });
}

// Project base + relative path from a browse request's query. browseBase falls back to
// the server's default cwd; browseRel defaults to "" (the base itself).
const browseBase = (req: Request, defaultCwd: string): string => resolveBase(typeof req.query.cwd === "string" ? req.query.cwd : null, defaultCwd);
const browseRel = (req: Request): string => (typeof req.query.path === "string" ? req.query.path : "");

// Resolve `path` under the request's project base; 403 (and returns null) if it escapes —
// lexically OR through a symlink. One containment gate shared by every route (read + write).
function containedFor(req: Request, res: Response, defaultCwd: string): string | null {
  const abs = resolveContained(browseBase(req, defaultCwd), browseRel(req), os.homedir());
  if (!abs) {
    res.status(403).json({ error: "path escapes the project root" });
    return null;
  }
  return abs;
}

type RenderDoc = (text: string, title: string) => string | Promise<string>;

// The file's text, or null with the response already answered. Shared by the rendered views
// so "directory / too large / missing" reads the same from every one of them.
function readTextOr4xx(res: Response, abs: string): string | null {
  try {
    const stat = fs.statSync(abs);
    if (stat.isDirectory()) {
      res.status(400).json({ error: "not a file" });
      return null;
    }
    // The same cap as /text and /write: a huge file must not be read and parsed into memory.
    if (stat.size > MAX_EDIT_BYTES) {
      res.status(413).json({ error: "file too large" });
      return null;
    }
    // Same rule as /text: a file whose bytes do not survive UTF-8 is not something to render as
    // a document either, and reading it here with "utf8" would put the same replaced content on
    // screen. Refused at the source so neither surface has to recognise mojibake (#2038).
    const text = losslessText(fs.readFileSync(abs));
    if (text === null) {
      res.status(415).json({ error: "this file cannot be shown as text", kind: "binary" });
      return null;
    }
    return text;
  } catch {
    res.status(404).json({ error: "not found" });
    return null;
  }
}

// A rendered view (#808): read the file the same guarded way, answer with a self-contained
// document under the sandbox CSP. Only the rendering differs between routes, so that is all
// the caller supplies.
function mountRenderedRoute(app: Express, routePath: string, defaultCwd: string, render: RenderDoc): void {
  app.get(routePath, async (req, res) => {
    const abs = containedFor(req, res, defaultCwd);
    if (!abs) return;
    const text = readTextOr4xx(res, abs);
    if (text === null) return;
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Content-Security-Policy", "sandbox");
    res.send(await render(text, path.basename(abs)));
  });
}

/** The search a request asks for, or null when it asks for nothing searchable. `regex` and
 *  `case` are opt-in: absent means literal matching and smart case, which is what a query typed
 *  into an empty box should do. */
function searchRequestFrom(req: Request): SearchRequest | null {
  const query = typeof req.query.q === "string" ? req.query.q : "";
  if (!isSearchable(query)) return null;
  // Only the exact string "1" turns a mode on. A checkbox sends a value we choose, and reading
  // anything truthy would make `?regex=false` enable regex.
  const flag = (name: string): boolean => req.query[name] === "1";
  return { query, regex: flag("regex"), ...(flag("case") ? { caseSensitive: true } : {}) };
}

/** Why a search that could not run could not run. The pattern is named only in regex mode, where
 *  it is the one part of the request git can reject — a fixed string cannot be a bad pattern, so
 *  blaming it there would send the reader to look at the wrong thing. */
const searchRefusal = (request: SearchRequest): string =>
  request.regex ? "that regular expression could not be used" : "the search could not be run in this directory";

/** One search, in a repository if this is one and over the plain directory if it is not.
 *
 *  The `--no-index` retry is driven by the EXIT CODE, because `git grep` exits 1 for "nothing
 *  matched" and that is a complete answer. Retrying on it would re-run the search with
 *  `.gitignore` unapplied and answer a clean "no results" with `node_modules`. */
async function runSearch(root: string, request: SearchRequest, signal: AbortSignal): Promise<SearchResult | null> {
  const tracked = await git(searchArgv(request, "git"), root, SEARCH_TIMEOUT_MS, signal);
  if (answered(tracked.code)) return { ...parseSearchOutput(tracked.stdout, tracked.code === null), source: "git" };
  // A NULL code is not a reason to try the other MODE. It means no process and no exit status —
  // timed out, killed, cancelled, or never spawned — and none of those say anything about whether
  // this is a repository. Retrying converts a repository search that TIMED OUT into a successful
  // `no-index` answer over the same directory with `.gitignore` unapplied, which is the
  // invalid-regex bug wearing different clothes: a failure presented as a result. Only a real exit
  // code that is not an answer means "git ran and refused", which is the case a second mode can fix.
  if (tracked.code === null) return null;
  const plain = await git(searchArgv(request, "no-index"), root, SEARCH_TIMEOUT_MS, signal);
  // NULL, not an empty result. The first attempt's exit code says "git would not do this", and 128
  // covers BOTH "not a repository" and `fatal: -e option, 'foo(': parentheses not balanced` — the
  // stderr that would separate them is deliberately discarded. So a failing fallback used to be
  // reported as a successful `no-index` search of zero files, which told the reader two untrue
  // things at once: that nothing matched, and that .gitignore was not applied because this is not a
  // repository. Both attempts failing means the search did not run, and that is what is said.
  return answered(plain.code) ? { ...parseSearchOutput(plain.stdout, plain.code === null), source: "no-index" } : null;
}

/** The content-search route. Its own mount for the reason `mountWriteRoute` is: the browse routes
 *  are already at the line budget, and a route that shells out deserves to be read on its own. */
function mountSearchRoute(app: Express, defaultCwd: string): void {
  // Search the CONTENTS of every file under the project base (#2140) — the companion to
  // /browse/index, which searches their names. Rooted at the base and not at `?path=` for the same
  // reason the index is: a result is handed to the tree and the editor, both of which resolve
  // relative to the root.
  //
  // Server-side per query, where the name finder ships its whole list once: the browser can hold
  // every path and cannot hold every file's text. So this is one subprocess per keystroke-after-
  // debounce, and the client aborts the previous one.
  app.get("/api/files/browse/search", async (req, res) => {
    const root = browseBase(req, defaultCwd);
    const request = searchRequestFrom(req);
    if (!request) return res.status(400).json({ error: "a search needs a query" });
    // A search the browser has walked away from is a subprocess nobody is waiting for. The panel
    // aborts its fetch on every keystroke-after-debounce, so without this each abandoned query
    // still costs a full `git grep` on a large repository — the client's cancellation would be a
    // claim about itself rather than about the work.
    //
    // Guarded on `writableEnded` because `close` also fires after a NORMAL response, where aborting
    // would kill nothing and mislead the next reader. Measured: a completed GET emits close with
    // `writableEnded === true`; a client abort before the response emits it with `false`.
    const hungUp = new AbortController();
    req.on("close", () => {
      if (!res.writableEnded) hungUp.abort();
    });
    try {
      const result = await runSearch(root, request, hungUp.signal);
      if (!result) return res.status(422).json({ error: searchRefusal(request) });
      res.json(result);
    } catch (err) {
      console.error("[api] /api/files/browse/search failed:", err);
      res.status(500).json({ error: "search failed" });
    }
  });
}

export function mountFilesBrowseRoutes(app: Express, deps: BrowseDeps): void {
  const { defaultCwd, backupRoot } = deps;

  mountSearchRoute(app, defaultCwd);

  app.get("/api/files/browse/list", (req, res) => {
    const root = browseBase(req, defaultCwd);
    const abs = containedFor(req, res, defaultCwd);
    if (!abs) return;
    try {
      if (!fs.statSync(abs).isDirectory()) return res.status(400).json({ error: "not a directory" });
      res.json({ cwd: path.resolve(root), path: browseRel(req), entries: listEntries(abs) });
    } catch {
      res.status(404).json({ error: "not found" });
    }
  });

  // Every file in the project as one flat list, for the pane's "open by name" finder (#2099).
  // Rooted at the project base and NOT at `?path=`: the finder hands what it picks straight to
  // the tree and the editor, both of which resolve relative to the root, so a list relative to
  // some subdirectory would open the wrong file at every depth.
  app.get("/api/files/browse/index", async (req, res) => {
    const root = browseBase(req, defaultCwd);
    try {
      res.json(await listProjectFiles(root));
    } catch {
      res.status(404).json({ error: "not found" });
    }
  });

  app.get("/api/files/browse/text", (req, res) => {
    const abs = containedFor(req, res, defaultCwd);
    if (!abs) return;
    try {
      const stat = fs.statSync(abs);
      if (stat.isDirectory()) return res.status(400).json({ error: "not a file" });
      if (stat.size > MAX_EDIT_BYTES) return res.status(413).json({ error: "file too large to edit" });
      // One read for both, so the version can't describe a different revision than the text.
      const bytes = fs.readFileSync(abs);
      // Refused rather than streamed into a textarea, which is what MAX_EDIT_BYTES' own comment
      // always claimed and only the size half of ever did. `toString("utf8")` replaces every byte
      // it cannot represent, so the file is already destroyed by the time it reaches the editor —
      // typing one character then commits the whole replacement (#2038: a 324-byte xlsx came back
      // 336 bytes and no longer opened as a zip). The BACKUP is taken from this same string, so
      // the safety net was storing the damaged version too; both are skipped by returning here.
      const text = losslessText(bytes);
      if (text === null) return res.status(415).json({ error: "this file cannot be edited as text", kind: "binary" });
      // Opening is the last moment this content is certainly intact — the editor may save over
      // it, and the agent in this directory may too. Same-content re-opens don't rotate.
      storeBackup(abs, text, backupRoot);
      res.json({ text, version: versionOfBytes(bytes) });
    } catch {
      res.status(404).json({ error: "not found" });
    }
  });

  // Just the version, for the editor's periodic "did this move under me?" check. The full
  // /text response would ship the whole file every poll to answer a 16-character question.
  app.get("/api/files/browse/version", (req, res) => {
    const abs = containedFor(req, res, defaultCwd);
    if (!abs) return;
    try {
      // The same cap as /text and /write. Without it, a file replaced on disk by a huge one
      // would be read and hashed in full on every poll — for a file the editor could no longer
      // open or save anyway.
      const stat = fs.statSync(abs, { throwIfNoEntry: false });
      if (stat && stat.size > MAX_EDIT_BYTES) return res.status(413).json({ error: "file too large" });
      res.json({ version: currentVersion(abs) });
    } catch {
      res.status(500).json({ error: "failed to read file" });
    }
  });

  const serveRendered = (routePath: string, render: RenderDoc) => mountRenderedRoute(app, routePath, defaultCwd, render);

  serveRendered("/api/files/browse/md", async (text, title) => htmlDoc(await marked.parse(text), title));
  serveRendered("/api/files/browse/json", (text, title) => jsonHtmlDoc(text, title));
  // The delimiter comes from the file's own extension, so one route serves .csv and .tsv.
  serveRendered("/api/files/browse/table", (text, title) => tableHtmlDoc(text, title, delimiterForExtension(path.extname(title))));

  mountWriteRoute(app, deps);
  mountBackupRoute(app, deps);
}

type BrowseDeps = { defaultCwd: string; backupRoot: string };

function mountWriteRoute(app: Express, { defaultCwd, backupRoot }: BrowseDeps): void {
  // Conditional write. `baseVersion` is the version the editor loaded (null = "I expect no
  // file here"); it is REQUIRED, because an optional one is a blind-write escape hatch and
  // blind writes are what this endpoint stopped doing. A mismatch answers 409 with the
  // version now on disk, which the caller can re-send to overwrite deliberately.
  app.put("/api/files/browse/write", (req, res) => {
    const abs = containedFor(req, res, defaultCwd);
    if (!abs) return;
    const body = requestBody(req.body);
    const text = body.text;
    const baseVersion = body.baseVersion;
    if (typeof text !== "string") return res.status(400).json({ error: "body.text (string) required" });
    if (baseVersion !== null && typeof baseVersion !== "string") return res.status(400).json({ error: "body.baseVersion (string|null) required" });
    if (Buffer.byteLength(text, "utf8") > MAX_EDIT_BYTES) return res.status(413).json({ error: "content too large" });
    try {
      if (fs.existsSync(abs) && fs.statSync(abs).isDirectory()) return res.status(400).json({ error: "path is a directory" });
      // Never write TEXT over content that is not text. This route only ever receives a string, so
      // overwriting a spreadsheet with one is always a loss — and the editor cannot be the only
      // thing stopping it: it reached here with an EMPTY buffer through Ctrl+S and "Overwrite
      // anyway", and truncated a 324-byte xlsx to 0 (CodeRabbit on #2038). Refused BEFORE
      // `backupCurrentFile`, which reads with "utf8" and would bank a damaged copy of the very
      // file it is meant to protect.
      if (fs.existsSync(abs) && losslessText(fs.readFileSync(abs)) === null) {
        return res.status(415).json({ error: "this file cannot be edited as text", kind: "binary" });
      }
      const onDisk = currentVersion(abs);
      if (onDisk !== baseVersion) return res.status(409).json({ error: "file changed on disk", version: onDisk });
      // What is about to be replaced, banked before it is. Best-effort: a backup that can't be
      // written must not turn into a refusal to save.
      backupCurrentFile(abs, backupRoot);
      const bytes = Buffer.from(text, "utf8");
      fs.writeFileSync(abs, bytes);
      res.json({ ok: true, version: versionOfBytes(bytes) });
    } catch {
      res.status(500).json({ error: "failed to write file" });
    }
  });
}

function mountBackupRoute(app: Express, { defaultCwd, backupRoot }: BrowseDeps): void {
  // Bank a buffer the CLIENT is about to discard — the conflict banner's "Reload", where the
  // content being dropped only ever existed in the editor. Nothing else can save it.
  app.put("/api/files/browse/backup", (req, res) => {
    const abs = containedFor(req, res, defaultCwd);
    if (!abs) return;
    const { text } = requestBody(req.body);
    if (typeof text !== "string") return res.status(400).json({ error: "body.text (string) required" });
    if (Buffer.byteLength(text, "utf8") > MAX_EDIT_BYTES) return res.status(413).json({ error: "content too large" });
    res.json({ stored: storeBackup(abs, text, backupRoot) !== null });
  });
}
