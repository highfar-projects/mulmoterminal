// Which root a request operates against — the one choke point four subsystems will
// share (collections now; accounting, wiki and resources later, see
// plans/project-architecture.md D4).
//
// WHY THIS EXISTS BEFORE IT DOES ANYTHING INTERESTING. Every root today resolves to the
// shared workspace, so this file changes no behaviour. What it buys is that the ~30 engine
// call sites now name a root explicitly instead of falling through to the engine's ambient
// default, which lets `configureCollectionHost` run in EXPLICIT-ROOT mode
// (`workspaceRoot: null`): a call that forgets its root throws `COLLECTION_ROOT_REQUIRED`
// instead of silently resolving against whichever workspace happened to be bound. On a host
// with one root that difference is invisible; on a host with one root PER PROJECT it is the
// difference between an error and quietly reading another project's data.
//
// Serving a second root is deliberately NOT wired here yet. When it is, the resolution order
// is: an explicit project parameter on the request (validated against the known-projects
// list) → the session's cwd → the workspace. The validation is not optional and not a detail:
// `resolveDataDir` only guarantees containment WITHIN the root it is handed, so the root
// itself is the trust boundary. A client-supplied path would turn every collection route into
// an arbitrary-directory reader, which is why the extension point below takes an opaque id
// resolved through directories we already know rather than a path.
import type { Request } from "express";
import { describeValue } from "../../common/readString.js";

/** A root, in the shape the collection engine's options already take, so it can be passed
 *  straight through as `opts` rather than unpacked at every call site. */
export interface ProjectScope {
  workspaceRoot: string;
}

let workspace: string | null = null;

/** Bind the shared workspace. Call once at boot, before any route resolves a scope. */
export function initProjectRoots(deps: { workspace: string }): void {
  workspace = deps.workspace;
}

/** Whether the binding is in place. Routes that answered 503 for "backend not initialized"
 *  before this module existed keep answering 503, rather than throwing into a 500. */
export function projectRootsConfigured(): boolean {
  return workspace !== null;
}

/** Test-only: drop the binding so a spec can assert the unconfigured failure. */
export function resetProjectRootsForTesting(): void {
  workspace = null;
}

function requireWorkspace(): string {
  if (workspace === null) {
    throw new Error("project roots are not configured — call initProjectRoots({ workspace }) at boot");
  }
  return workspace;
}

/** The shared workspace, for callers that have no request: boot paths, the agent tool
 *  dispatch, the completion watchers. Separate from `resolveProjectRoot` so those callers
 *  read as what they are — "the workspace" — rather than as a request that lost its `req`. */
export function workspaceScope(): ProjectScope {
  return { workspaceRoot: requireWorkspace() };
}

/** The root this request operates against — the workspace, today.
 *
 *  A `project` parameter is REFUSED rather than ignored. Ignoring it would mean a client that
 *  asks for one project and is served another, with nothing anywhere saying so — the same
 *  silent-wrong-root failure explicit-root mode exists to remove, just moved onto the wire.
 *  A build that cannot honour the request should say so. */
export function resolveProjectRoot(req: Request): ProjectScope {
  // PRESENCE is the test, not the value's shape. `?project=a&project=b` arrives as an array
  // and `?project[x]=y` as an object, so a `typeof === "string"` check would let both through
  // as "absent" and quietly serve the workspace — the exact silent substitution this refuses.
  // An empty `?project=` is refused for the same reason: the client meant to name one.
  if (Object.hasOwn(req.query, "project")) {
    // Caller-controlled, and it lands in a log line via `guarded`; `describeValue` renders a
    // non-string shape without interpolating it, and CR/LF is stripped so no id can forge one.
    const described = describeValue(req.query.project).replace(/[\r\n]/g, " ");
    throw new Error(`project scoping is not enabled on this server (received project: ${described})`);
  }
  return { workspaceRoot: requireWorkspace() };
}
