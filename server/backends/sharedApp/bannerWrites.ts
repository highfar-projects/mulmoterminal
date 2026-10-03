// The banner an app's theme declares (receptron/mulmoserver#336): read from the repository at publish,
// checked to be the picture its name says, and written to `config/banner` for the public page to show
// through `<img>`. Withdrawn whenever the app does not declare one or is not public — `config/*` stays
// world-readable whatever else is closed.
import path from "node:path";
import { BANNER_DOC, BANNER_MAX_BYTES, BANNER_TYPES, appConfigPath, type AuthoredApp } from "@receptron/sharedapp";

import type { SharedAppHandle } from "./context.js";
import { containedPath, openContained } from "./publicView.js";
import type { WriteStep } from "./writes.js";

export interface Banner {
  contentType: string;
  /** Base64. */
  data: string;
}

const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const JPEG = [0xff, 0xd8, 0xff];
const SVG_HEAD_BYTES = 1024;

const startsWith = (bytes: Buffer, signature: readonly number[], at = 0): boolean => signature.every((byte, index) => bytes[at + index] === byte);

/** The picture kind the BYTES are, whatever the file is called — or null. */
export const bannerKindOf = (bytes: Buffer): string | null => {
  if (startsWith(bytes, PNG)) return "image/png";
  if (startsWith(bytes, JPEG)) return "image/jpeg";
  if (bytes.subarray(0, 4).toString("latin1") === "RIFF" && bytes.subarray(8, 12).toString("latin1") === "WEBP") return "image/webp";
  const head = bytes.subarray(0, SVG_HEAD_BYTES).toString("utf8").trimStart();
  if ((head.startsWith("<svg") || head.startsWith("<?xml")) && head.includes("<svg")) return "image/svg+xml";
  return null;
};

/** The extension's kind, as the publisher allows it. */
const declaredKindOf = (file: string): string | undefined => BANNER_TYPES[path.extname(file).slice(1).toLowerCase()];

export async function readBanner(root: string, authored: AuthoredApp): Promise<{ ok: true; banner: Banner | null } | { ok: false; problems: string[] }> {
  const declared = authored.theme?.banner;
  if (declared === undefined) return { ok: true, banner: null };
  const inside = await containedPath(root, declared, "theme.banner");
  if (!inside.ok) return inside;
  const opened = await openContained(inside.full, declared, "theme.banner", BANNER_MAX_BYTES);
  if (!opened.ok) return opened;
  const kind = bannerKindOf(opened.bytes);
  if (kind === null || kind !== declaredKindOf(declared)) {
    return {
      ok: false,
      problems: [`theme.banner names '${declared}', whose contents are not the ${declaredKindOf(declared) ?? "picture"} its name says. Nothing was written.`],
    };
  }
  return { ok: true, banner: { contentType: kind, data: opened.bytes.toString("base64") } };
}

/** Removing the banner — what unpublish does, and what publish does when there is none to show. */
export function bannerRemoval(handle: SharedAppHandle, aid: string): WriteStep[] {
  const at = appConfigPath(aid);
  return [
    {
      what: `removing the banner (${at}/${BANNER_DOC})`,
      run: async () => {
        await handle.docs.delete(at, BANNER_DOC);
      },
    },
  ];
}

/** The banner's write, or — not declared, or the app not public — its removal. */
export function bannerWrites(handle: SharedAppHandle, aid: string, banner: Banner | null, isPublic: boolean, publishedAt: number): WriteStep[] {
  if (banner === null || !isPublic) return bannerRemoval(handle, aid);
  const at = appConfigPath(aid);
  return [{ what: `the banner (${at}/${BANNER_DOC})`, run: () => handle.docs.set(at, BANNER_DOC, { ...banner, publishedAt }) }];
}
