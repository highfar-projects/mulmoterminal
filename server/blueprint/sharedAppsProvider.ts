// The shared apps a build may start from: the known folders (the workspace and the saved ones) that hold an `app.json`
// and shared collections beside it. Folders are named by their opaque id, never by path.
import path from "node:path";
import { readFile } from "node:fs/promises";
import type { LoadedCollection } from "@mulmoclaude/core/collection/server";
import { isRecord } from "../../common/isRecord.js";
import type { OpenedApp, SharedApps } from "./collectionSnapshot.js";

export interface SharedAppsDeps {
  roots: () => readonly { id: string; label: string; cwd: string }[];
  collectionsOf: (root: string) => Promise<LoadedCollection[]>;
  signedInEmail: () => string | null;
}

const APP_FILE = "app.json";

// The declaration as an object, or null when it is not one: a copy of text that is not JSON would stop the spec check
// that reads it, and says nothing about who may do what anyway.
const declarationIn = (manifest: string): Record<string, unknown> | null => {
  try {
    const parsed: unknown = JSON.parse(manifest);
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
};

const nameIn = (declaration: Record<string, unknown>): string | null =>
  typeof declaration.name === "string" && declaration.name.trim() !== "" ? declaration.name : null;

/** The app in `root`, or null when the folder has no `app.json` that is a JSON object, or no shared collection beside it. */
async function openAt(root: string, label: string, deps: SharedAppsDeps): Promise<OpenedApp | null> {
  const manifest = await readFile(path.join(root, APP_FILE), "utf8").catch(() => null);
  const declaration = manifest === null ? null : declarationIn(manifest);
  if (manifest === null || declaration === null) return null;
  const collections = await deps.collectionsOf(root).catch(() => []);
  return collections.length === 0 ? null : { root, manifest, title: nameIn(declaration) ?? label, collections };
}

export function sharedAppsFromFolders(deps: SharedAppsDeps): SharedApps {
  return {
    async list() {
      const opened = await Promise.all(deps.roots().map(async (root) => ({ id: root.id, app: await openAt(root.cwd, root.label, deps) })));
      return opened.flatMap(({ id, app }) => (app === null ? [] : [{ id, title: app.title }]));
    },
    // Only a folder the list offers can be opened: an id is never turned back into a path by any other route.
    async open(id) {
      const root = deps.roots().find((candidate) => candidate.id === id);
      return root === undefined ? null : openAt(root.cwd, root.label, deps);
    },
    signedInEmail: deps.signedInEmail,
  };
}
