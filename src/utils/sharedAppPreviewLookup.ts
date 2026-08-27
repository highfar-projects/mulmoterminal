// "HAVE I ALREADY GOT THIS ROW?", asked of the server for the ONE key a page names.
//
// Its own module for the reason `sharedAppPreviewPayload.ts` is: the pane it serves is at its
// line limit, and this is a request and a narrowing with no browser and no component in it.
//
// The question exists because `viewer.mine` cannot answer it. A composite id is `uid + "_" +
// <field>` and the rules grant a submitter the document they can NAME rather than a range of
// them, so the key is the half the host is missing and the page has.
import { fetchWithTimeout, SLOW_COMMAND_TIMEOUT_MS } from "./fetchWithTimeout";
import { isRecord } from "../../common/isRecord";

/** A REJECTION is the honest failure and `{ found: false }` is not: a refused read, an app that
 *  has never been published and a collection whose ids cannot be built from a key are all "nobody
 *  looked", and the parent turns a rejection into exactly that. Answering "no" instead would tell
 *  the author's page that they have not submitted, and it would stop offering an action they are
 *  entitled to. */
export async function lookupOwnRow(url: string, ask: { cid: string; key: string }): Promise<{ found: boolean; record?: Record<string, unknown> }> {
  const res = await fetchWithTimeout(
    url,
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ cid: ask.cid, key: ask.key }) },
    SLOW_COMMAND_TIMEOUT_MS,
  );
  const body: unknown = await res.json();
  if (!isRecord(body) || body.ok !== true) throw new Error("nothing could be looked up");
  const record = isRecord(body.record) ? body.record : undefined;
  return { found: body.found === true, ...(record === undefined ? {} : { record }) };
}
