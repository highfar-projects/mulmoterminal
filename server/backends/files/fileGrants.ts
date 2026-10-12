// One-file URLs for a file outside every directory the raw route serves (#3024).
//
// The raw route refuses a directory that is not the workspace or a live session's, because a GET
// carries no Origin a cross-site `<img>` or `<video>` could be told apart by. A grant is minted by a
// POST instead, which `sameOriginGuard` already limits to the app's own pages, and names exactly one
// file: the token is unguessable, held only in memory (so a restart ends it), and a request for any
// other name under it — the image a granted page links beside itself — is not served.
//
// Same-origin code could already read any file through the browse routes, whose base is an input;
// what this adds is a URL a tab can load, not a wider reach.
import { randomBytes } from "node:crypto";
import { statSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Express, Request, Response } from "express";
import { FILE_GRANT_ROUTE, GRANTED_FILE_ROUTE, grantKind, type GrantKind } from "../../../common/fileGrant.js";
import { isRecord } from "../../../common/isRecord.js";
import { expandTilde, realpathOr } from "../../files/pathContainment.js";
import { sendHtmlDocument } from "../plugins/html.js";
import { sendRawFile } from "./sendRawFile.js";

interface Grant {
  abs: string;
  name: string;
  kind: GrantKind;
}

const TOKEN_BYTES = 24;
/** A bound on memory, not an expiry: a grant per click, and this many clicks is a very long session. */
const MAX_GRANTS = 1000;

const grants = new Map<string, Grant>();

function remember(grant: Grant): string {
  const existing = [...grants].find(([, held]) => held.abs === grant.abs && held.name === grant.name);
  if (existing) return existing[0];
  const token = randomBytes(TOKEN_BYTES).toString("hex");
  grants.set(token, grant);
  const oldest = grants.size > MAX_GRANTS ? grants.keys().next().value : undefined;
  if (oldest !== undefined) grants.delete(oldest);
  return token;
}

type Granting = { status: 200; grant: Grant } | { status: 400 | 404 | 415; error: string };

/** What the clicked path names, if it is a file a tab may be given. */
function grantFor(requested: unknown): Granting {
  if (typeof requested !== "string" || requested === "") return { status: 400, error: "`path` is required" };
  const expanded = expandTilde(requested, os.homedir());
  if (!path.isAbsolute(expanded)) return { status: 400, error: "`path` must be absolute" };
  const name = path.basename(expanded);
  const kind = grantKind(name);
  if (kind === null) return { status: 415, error: "not a file a tab can show" };
  const abs = realpathOr(path.resolve(expanded));
  const isFile = ((): boolean | null => {
    try {
      return statSync(abs).isFile();
    } catch {
      return null;
    }
  })();
  if (isFile === null) return { status: 404, error: "file not found" };
  if (!isFile) return { status: 400, error: "not a file" };
  return { status: 200, grant: { abs, name, kind } };
}

function mountGrant(app: Express): void {
  app.post(FILE_GRANT_ROUTE, (req: Request, res: Response) => {
    const granting = grantFor(isRecord(req.body) ? req.body.path : undefined);
    if (granting.status !== 200) return res.status(granting.status).json({ error: granting.error });
    const token = remember(granting.grant);
    return res.json({ url: `${GRANTED_FILE_ROUTE}/${token}/${encodeURIComponent(granting.grant.name)}` });
  });
}

function mountGranted(app: Express): void {
  app.get(`${GRANTED_FILE_ROUTE}/:token/:name`, (req: Request, res: Response) => {
    const { token, name } = req.params;
    const grant = typeof token === "string" ? grants.get(token) : undefined;
    // The name must be the granted one: a page's relative link resolves to another name under the
    // same token, and serving it would open the page's directory, not the page.
    if (!grant || name !== grant.name) return res.status(404).json({ error: "not found" });
    if (grant.kind === "page") return sendHtmlDocument(res, grant.abs);
    return sendRawFile(req, res, grant.abs, grant.name);
  });
}

export function mountFileGrantRoutes(app: Express): void {
  mountGrant(app);
  mountGranted(app);
}
