// The phone's view of the files a project declares under `mobileFiles` (#2911).
//
//   listMobileFileProjects — the projects that declare any, so the phone offers only those.
//   listMobileFiles        — one page of a project's files, newest first; metadata only.
//   getMobileFile          — one file: inline when it fits the command document, else staged in
//                            the owner's Storage for an hour.
//
// Nothing is visible without the declaration, and the path the phone sends is re-checked against
// it on every call (../mobileFileWalk.ts) rather than trusted because a listing once showed it.
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { REMOTE_VIEW_MAX_BYTES } from "@mulmoclaude/core/remote-view";
import { toJsonObject, type CommandHandlers, type JsonObject } from "@mulmoclaude/core/remote-host";

import {
  MOBILE_FILE_EXTENSIONS,
  mobileFileContentType,
  mobileFileKind,
  type MobileFileContent,
  type MobileFileKind,
  type MobileFileListing,
} from "../../../../common/mobileFiles.js";
import { loadDirConfig, type MobileFilesConfig } from "../../../config/dir/dir-config.js";
import { listProjectRoots } from "../../../infra/project-root.js";
import { clampLimit, clampOffset } from "../collectionPage.js";
import { scopeFromCommand } from "../commandScope.js";
import { prepareDocument, type ImageLoader } from "../mobileFileInline.js";
import { listDeclaredFiles, resolveRequestedFile } from "../mobileFileWalk.js";
import type { MobileFileStager } from "../mobileFileStaging.js";
import { projectChoices } from "./listCollectionProjects.js";

/** A document read whole to be prepared; past this it is not embedded or wrapped. */
export const MAX_TEXT_FILE_BYTES = 10 * 1024 * 1024;
/** What may be staged at all — the same ceiling the phone's own uploads have. */
export const MAX_STAGED_FILE_BYTES = 100 * 1024 * 1024;
/** How much embedded image a staged (not inline) document may carry. */
const STAGED_IMAGE_BUDGET_BYTES = 20 * 1024 * 1024;

const IMAGE_EXTENSIONS = MOBILE_FILE_EXTENSIONS.filter((extension) => mobileFileKind(`x.${extension}`) === "image");

export interface MobileFileHandlerDeps {
  workspace: string;
  stager: MobileFileStager;
}

const NOT_SHARED = "This project does not share any files with your phone. Add mobileFiles to its .mulmoterminal.json.";

function declaredConfig(params: JsonObject, workspace: string): { root: string; config: MobileFilesConfig | null } {
  const root = scopeFromCommand(params, workspace).workspaceRoot;
  return { root, config: loadDirConfig(root).mobileFiles };
}

/** A src's path part with %-escapes undone, or null when the escapes are malformed. */
function decodedPath(src: string): string | null {
  try {
    return decodeURIComponent(src.split(/[?#]/)[0] ?? "");
  } catch {
    return null;
  }
}

/** Images a document names, embeddable only when they are themselves inside a declared directory. */
function imageLoader(root: string, config: MobileFilesConfig, documentPath: string): ImageLoader {
  const imagesOnly: MobileFilesConfig = { dirs: config.dirs, extensions: IMAGE_EXTENSIONS };
  return async (src) => {
    const decoded = decodedPath(src);
    if (decoded === null) return null;
    const requested = path.posix.normalize(path.posix.join(path.posix.dirname(documentPath), decoded));
    const absolute = await resolveRequestedFile(root, imagesOnly, requested);
    if (!absolute) return null;
    const bytes = await readFile(absolute);
    return { dataUrl: `data:${mobileFileContentType(requested)};base64,${bytes.toString("base64")}` };
  };
}

interface SharedFile {
  requested: string;
  absolute: string;
  kind: MobileFileKind;
  bytes: number;
  modifiedAtMs: number;
}

async function locate(root: string, config: MobileFilesConfig, requested: string): Promise<SharedFile> {
  const absolute = await resolveRequestedFile(root, config, requested);
  const kind = mobileFileKind(requested);
  if (!absolute || !kind) throw new Error("That file is not one this project shares with your phone.");
  const stats = await stat(absolute);
  return { requested, absolute, kind, bytes: stats.size, modifiedAtMs: stats.mtimeMs };
}

async function staged(stager: MobileFileStager, file: SharedFile, read: () => Promise<Uint8Array>, omittedImages: number): Promise<MobileFileContent> {
  const contentType = mobileFileContentType(file.requested);
  const object = await stager.stage({ absolutePath: file.absolute, modifiedAtMs: file.modifiedAtMs, bytes: file.bytes }, read, contentType);
  const expiresAt = new Date(object.expiresAtMs).toISOString();
  return {
    delivery: "storage",
    kind: file.kind,
    path: file.requested,
    storagePath: object.storagePath,
    contentType,
    bytes: file.bytes,
    expiresAt,
    omittedImages,
  };
}

/** A document inline when it fits the command document after its images are embedded, else staged. */
async function deliverDocument(
  deps: MobileFileHandlerDeps,
  root: string,
  config: MobileFilesConfig,
  file: SharedFile,
  kind: "markdown" | "html",
): Promise<MobileFileContent> {
  if (file.bytes > MAX_TEXT_FILE_BYTES) throw new Error("That document is too large to open on your phone.");
  const text = await readFile(file.absolute, "utf8");
  const load = imageLoader(root, config, file.requested);
  const inline = await prepareDocument(text, kind, load, REMOTE_VIEW_MAX_BYTES - Buffer.byteLength(text));
  if (Buffer.byteLength(inline.text) <= REMOTE_VIEW_MAX_BYTES)
    return { delivery: "inline", kind, path: file.requested, text: inline.text, omittedImages: inline.omittedImages };
  const large = await prepareDocument(text, kind, load, STAGED_IMAGE_BUDGET_BYTES);
  return staged(deps.stager, file, async () => Buffer.from(large.text, "utf8"), large.omittedImages);
}

async function deliver(deps: MobileFileHandlerDeps, root: string, config: MobileFilesConfig, requested: string): Promise<MobileFileContent> {
  const file = await locate(root, config, requested);
  if (file.kind === "markdown" || file.kind === "html") return deliverDocument(deps, root, config, file, file.kind);
  if (file.bytes > MAX_STAGED_FILE_BYTES) throw new Error("That file is too large to open on your phone.");
  return staged(deps.stager, file, () => readFile(file.absolute), 0);
}

export function createMobileFileHandlers(deps: MobileFileHandlerDeps): CommandHandlers {
  return {
    listMobileFileProjects: async () =>
      toJsonObject({ projects: projectChoices(listProjectRoots().filter((project) => loadDirConfig(project.cwd).mobileFiles !== null)) }),

    listMobileFiles: async (params: JsonObject) => {
      const offset = clampOffset(params.offset);
      const limit = clampLimit(params.limit);
      const { root, config } = declaredConfig(params, deps.workspace);
      void deps.stager.sweepExpired();
      if (!config) return toJsonObject<MobileFileListing>({ configured: false, files: [], total: 0, offset, limit, truncated: false });
      const { files, truncated } = await listDeclaredFiles(root, config);
      return toJsonObject<MobileFileListing>({ configured: true, files: files.slice(offset, offset + limit), total: files.length, offset, limit, truncated });
    },

    getMobileFile: async (params: JsonObject) => {
      const { root, config } = declaredConfig(params, deps.workspace);
      if (!config) throw new Error(NOT_SHARED);
      return toJsonObject<MobileFileContent>(await deliver(deps, root, config, typeof params.path === "string" ? params.path : ""));
    },
  };
}
