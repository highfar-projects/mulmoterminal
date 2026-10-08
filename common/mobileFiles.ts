// Which files a project lets the phone see (#2911), and the wire shapes the two commands answer.
//
// Declared, never discovered: a project lists the directories and extensions in its
// `.mulmoterminal.json` under `mobileFiles`, and nothing is visible without that. These rules are
// pure so the containment-adjacent decisions (which extension, which name) are testable without a
// filesystem; the filesystem half lives in server/config/dir/dir-file.ts and the remote-host backend.

export const MOBILE_FILE_KINDS = ["markdown", "html", "pdf", "image"] as const;
export type MobileFileKind = (typeof MOBILE_FILE_KINDS)[number];

// The host's allowlist. A project can narrow it, never widen it. svg is absent on purpose: it can
// carry script, and an image on the phone is shown as an image, not run.
export const MOBILE_FILE_EXTENSIONS = ["md", "markdown", "html", "htm", "pdf", "png", "jpg", "jpeg", "gif", "webp"] as const;
export type MobileFileExtension = (typeof MOBILE_FILE_EXTENSIONS)[number];

const SERVABLE_EXTENSIONS: Readonly<Record<MobileFileExtension, { kind: MobileFileKind; contentType: string }>> = {
  md: { kind: "markdown", contentType: "text/markdown" },
  markdown: { kind: "markdown", contentType: "text/markdown" },
  html: { kind: "html", contentType: "text/html" },
  htm: { kind: "html", contentType: "text/html" },
  pdf: { kind: "pdf", contentType: "application/pdf" },
  png: { kind: "image", contentType: "image/png" },
  jpg: { kind: "image", contentType: "image/jpeg" },
  jpeg: { kind: "image", contentType: "image/jpeg" },
  gif: { kind: "image", contentType: "image/gif" },
  webp: { kind: "image", contentType: "image/webp" },
};

const isMobileFileExtension = (value: string): value is MobileFileExtension => MOBILE_FILE_EXTENSIONS.some((extension) => extension === value);

export const MAX_MOBILE_FILE_DIRS = 16;

/** One `extensions` entry as a person writes it — any case, an optional leading dot. The editor's
 *  schema needs a pattern rather than a list, and a spec pins it to MOBILE_FILE_EXTENSIONS. */
export const MOBILE_FILE_EXTENSION_PATTERN = /^\s*\.?(?:md|markdown|html?|pdf|png|jpe?g|gif|webp)\s*$/i;

/** The extension of the last path segment, lowercased, without the dot; "" when there is none. */
export function extensionOf(relativePath: string): string {
  const name = relativePath.split("/").pop() ?? "";
  const dot = name.lastIndexOf(".");
  return dot <= 0 ? "" : name.slice(dot + 1).toLowerCase();
}

export function mobileFileKind(relativePath: string): MobileFileKind | null {
  const extension = extensionOf(relativePath);
  return isMobileFileExtension(extension) ? SERVABLE_EXTENSIONS[extension].kind : null;
}

export function mobileFileContentType(relativePath: string): string {
  const extension = extensionOf(relativePath);
  return isMobileFileExtension(extension) ? SERVABLE_EXTENSIONS[extension].contentType : "application/octet-stream";
}

/** A project's `extensions`, reduced to the allowlist: trimmed, lowercased, leading dot dropped,
 *  deduped. Anything the host does not serve is dropped rather than kept. */
export function normalizeMobileFileExtensions(input: unknown): MobileFileExtension[] {
  if (!Array.isArray(input)) return [];
  const cleaned = input
    .filter((entry): entry is string => typeof entry === "string")
    .map((entry) => entry.trim().replace(/^\./, "").toLowerCase())
    .filter(isMobileFileExtension);
  return [...new Set(cleaned)];
}

/** A path segment the phone never sees into: hidden (`.env`, `.git`) or a vendored dependency tree. */
export const isExcludedSegment = (segment: string): boolean => segment.startsWith(".") || segment === "node_modules";

/** Whether a path (POSIX, relative to a declared directory) names a file the phone may see:
 *  no excluded segment (`.env`, anything under `.git` or `node_modules`), no empty or `..`
 *  segment, and an extension the project declared. */
export function isServableMobilePath(relativePath: string, extensions: readonly MobileFileExtension[]): boolean {
  const segments = relativePath.split("/");
  if (segments.some((segment) => segment === "" || segment === ".." || isExcludedSegment(segment))) return false;
  const extension = extensionOf(relativePath);
  return isMobileFileExtension(extension) && extensions.includes(extension);
}

/** One row of `listMobileFiles`. `path` is relative to the PROJECT root, POSIX — never absolute,
 *  so no home directory travels to the phone. */
export interface MobileFileEntry {
  path: string;
  kind: MobileFileKind;
  bytes: number;
  modifiedAt: string;
}

export interface MobileFileListing {
  /** False when the project declares no `mobileFiles`: the phone says how to turn it on. */
  configured: boolean;
  files: MobileFileEntry[];
  total: number;
  offset: number;
  limit: number;
  /** The walk stopped at its budget, so older files may be missing from `total`. */
  truncated: boolean;
}

/** What `getMobileFile` answers. Text small enough to ride in the command document comes inline
 *  (`html` already wrapped in its isolating CSP); anything else is staged in the owner's Storage
 *  and read there with the owner's own credentials. */
export type MobileFileContent =
  | { delivery: "inline"; kind: "markdown" | "html"; path: string; text: string; omittedImages: number }
  | {
      delivery: "storage";
      kind: MobileFileKind;
      path: string;
      /** Read with the owner's own credentials (`getBlob`); deleted at `expiresAt`. */
      storagePath: string;
      contentType: string;
      bytes: number;
      expiresAt: string;
      omittedImages: number;
    };
