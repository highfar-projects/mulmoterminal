// The code block a Preview button asked for (#2615), read from the FILE on disk — the document the
// Preview draws is that file, and it names only a block's number. Reading it here, not taking text
// out of the document, is what keeps a `.md`'s markup and styles away from what is copied.
import { browseQuery } from "./filesPaneApi";
import { jsonBody } from "../jsonBody";
import { fetchWithTimeout } from "../utils/fetchWithTimeout";
import { previewCodeBlocks, type PreviewCodeBlock } from "../../common/previewCodeBlocks";

export type CodeBlockLookup = { status: "found"; block: PreviewCodeBlock } | { status: "missing" } | { status: "failed" };

/** The `index`-th block of `text`, or "missing" — the file changed since the Preview was drawn. */
export const codeBlockIn = (text: string, index: number): CodeBlockLookup => {
  const block = previewCodeBlocks(text)[index];
  return block ? { status: "found", block } : { status: "missing" };
};

export async function previewCodeBlockAt(cwd: string | null, pathRel: string, index: number): Promise<CodeBlockLookup> {
  try {
    const res = await fetchWithTimeout(`/api/files/browse/text?${browseQuery(cwd, pathRel)}`);
    const body = await jsonBody(res);
    return res.ok && typeof body.text === "string" ? codeBlockIn(body.text, index) : { status: "failed" };
  } catch {
    return { status: "failed" };
  }
}
