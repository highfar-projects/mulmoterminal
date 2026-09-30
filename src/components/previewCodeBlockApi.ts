// The code block a Preview button asked for (#2615), read from the FILE on disk by the server — the
// document the Preview draws is that file, and it names only a block's number. Reading it there, not
// taking text out of the document, keeps a `.md`'s markup and styles away from what is copied.
import { browseQuery } from "./filesPaneApi";
import { jsonBody } from "../jsonBody";
import { fetchWithTimeout } from "../utils/fetchWithTimeout";
import { isPreviewCodeBlock, type PreviewCodeBlock } from "../../common/previewCodeBlocks";

export type CodeBlockLookup = { status: "found"; block: PreviewCodeBlock } | { status: "missing" } | { status: "failed" };

export async function previewCodeBlockAt(cwd: string | null, pathRel: string, index: number): Promise<CodeBlockLookup> {
  try {
    const res = await fetchWithTimeout(`/api/files/browse/code-block?${browseQuery(cwd, pathRel)}&index=${index}`);
    const body = await jsonBody(res);
    if (res.ok) return isPreviewCodeBlock(body) ? { status: "found", block: body } : { status: "failed" };
    // The file changed since the Preview was drawn, and has fewer blocks now.
    return res.status === 404 && body.kind === "no-block" ? { status: "missing" } : { status: "failed" };
  } catch {
    return { status: "failed" };
  }
}
