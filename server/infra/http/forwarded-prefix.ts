// The prefix a relaying server put in front of this one's routes (common/peers.ts): when this server
// is a PEER, the browser reaches `/api/files/raw` as `/peer/<id>/api/files/raw` on the server it is
// talking to. A document this server renders and sends back — a Markdown preview, an HTML page —
// writes root-relative links of its own, and those must carry the prefix or they resolve against the
// OTHER server.
//
// Only a value of exactly that shape is taken: it ends up inside an HTML attribute and a Location
// header, and anything a client sends here only shapes that client's own document. A request that
// did not come through a relay has no such header and gets the empty prefix — every link as before.
import type { IncomingHttpHeaders } from "node:http";
import { isPeerPathPrefix } from "../../../common/peers.js";

export const FORWARDED_PREFIX_HEADER = "x-forwarded-prefix";

export function forwardedPrefix(req: { headers: IncomingHttpHeaders }): string {
  const value = req.headers[FORWARDED_PREFIX_HEADER];
  return isPeerPathPrefix(value) ? value : "";
}
