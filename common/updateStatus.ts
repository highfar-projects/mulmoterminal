// What GET /api/update-status answers: which install is running, what it is, and what is newer.
// Shared because both sides decide from it — the server builds it from the startup probe, the
// header badge and the Settings version line read it.

import { isRecord } from "./isRecord.js";

/** How the tool was installed, which decides what "the running version" even means. */
export type InstallKind = "npm" | "git";

/**
 * Whose build this is. The version number alone cannot say: a fork that merges upstream's release
 * carries the same `version`. Decided by the manifest's own `repository` (bin/update-check.js
 * `isUpstreamPackage`), so it needs no file of its own that a merge could trample.
 */
export type Distribution = "upstream" | "fork";

export interface UpdateStatus {
  /** False until the startup check has landed; `commit` / `latest` / `notice` are not final yet. */
  ready: boolean;
  install: InstallKind;
  distribution: Distribution;
  /** The shipped package.json version. For a git checkout this is the last release, not the build. */
  version: string;
  /** git installs: short HEAD sha — the only thing that identifies which build is running. */
  commit: string | null;
  /** npm installs: the registry's version, present only when it is newer than `version`. */
  latest: string | null;
  /** The one-line "update available" rendering both the launcher and the header badge show. */
  notice: string | null;
}

const isInstallKind = (value: unknown): value is InstallKind => value === "npm" || value === "git";

const stringOrNull = (value: unknown): string | null => (typeof value === "string" ? value : null);

/**
 * The response as a status, or null when it is not one. Null rather than a filled-in default: a
 * body we could not read must leave the version line hidden, not print a version nobody is on.
 */
export function parseUpdateStatus(body: unknown): UpdateStatus | null {
  if (!isRecord(body) || !isInstallKind(body.install) || typeof body.version !== "string") return null;
  return {
    ready: body.ready === true,
    install: body.install,
    // A server that predates the field is upstream's, which never sends it.
    distribution: body.distribution === "fork" ? "fork" : "upstream",
    version: body.version,
    commit: stringOrNull(body.commit),
    latest: stringOrNull(body.latest),
    notice: stringOrNull(body.notice),
  };
}
