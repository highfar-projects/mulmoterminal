// What a Preview code-block press copies straight away, and how (#3003). The dialog (#2615) is now
// the exception: it opens only when the block cannot be copied as it is.
import { revealHidden } from "../../common/hiddenCharacters";
import type { CodeBlockLookup } from "./previewCodeBlockApi";

/** The lines a paste makes: a CR alone is Enter there too. */
export const lineCountOf = (text: string): number => text.split(/\r\n|\r|\n/).length;

/** The block's text when a press may copy it without showing it first, else null — the dialog then
 *  shows it. A block with characters a reader cannot see (invisible, control, direction-changing)
 *  goes to the dialog, which writes them out as `<U+…>`. */
export function directCopyText(lookup: CodeBlockLookup): string | null {
  if (lookup.status !== "found") return null;
  return revealHidden(lookup.block.text).hidden === 0 ? lookup.block.text : null;
}

export interface CopiedNotice {
  lines: number;
  /** What the reader checks before pasting: the block's first line. */
  firstLine: string;
}

export const copiedNoticeFor = (text: string): CopiedNotice => ({ lines: lineCountOf(text), firstLine: text.split(/\r\n|\r|\n/)[0] ?? "" });

const NO_TEXT = "nothing to copy directly";

/** Writes `text` once it arrives; false when there is none or the browser refuses.
 *
 *  The press happened in the Preview's frame and the text is fetched after it, so the write is
 *  started BEFORE the fetch, with a ClipboardItem holding the pending text — the shape Safari accepts
 *  for a write whose content arrives later. Chromium takes either shape. */
export async function writeClipboardLater(text: Promise<string | null>): Promise<boolean> {
  const required = text.then((value) => (value === null ? Promise.reject(new Error(NO_TEXT)) : value));
  try {
    if (typeof ClipboardItem !== "undefined" && typeof navigator.clipboard.write === "function") {
      const blob = required.then((value) => new Blob([value], { type: "text/plain" }));
      // A browser that refuses the write never reads the item, and its rejection must not go unhandled.
      blob.catch(() => undefined);
      await navigator.clipboard.write([new ClipboardItem({ "text/plain": blob })]);
    } else {
      await navigator.clipboard.writeText(await required);
    }
    return true;
  } catch {
    return false;
  }
}
