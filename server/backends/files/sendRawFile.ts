// The bytes of one file the caller has already authorised: its type, the sandbox, the name a save
// gets, and Range. Shared by the raw route and the one-file grants, so a granted file is served
// exactly as the raw route would serve it. `rel` is what the save name is taken from.
import type { Request, Response } from "express";
import { statFileOr404 } from "./statFileOr404.js";
import { parseByteRange } from "./byte-range.js";
// Named export: 3.x is ESM and ships its own types. Express uses this same package for
// `res.attachment()`, so the RFC 6266 escaping is the one the rest of the stack already trusts.
import { create as contentDisposition } from "content-disposition";
import { rawServingPlan } from "./rawServingPlan.js";
import { servedFileName } from "./servedFileName.js";
import { streamFileToResponse } from "./streamFile.js";

export function sendRawFile(req: Request, res: Response, abs: string, rel: string): void {
  const stat = statFileOr404(res, abs);
  if (!stat) return;

  const plan = rawServingPlan(abs, stat.size);
  if (plan.tooLarge) {
    res.status(413).json({ error: `file too large (${stat.size} bytes)` });
    return;
  }

  res.setHeader("Content-Type", plan.contentType);
  res.setHeader("X-Content-Type-Options", "nosniff");
  // An SVG/HTML with embedded JS must not escape into the app origin; PDFs and audio/video are
  // the exceptions (a browser cannot show them sandboxed). See rawServingPlan.
  if (plan.sandbox) res.setHeader("Content-Security-Policy", "sandbox");
  res.setHeader("Accept-Ranges", "bytes");
  // The name a save from the browser gets. Without it the browser falls back to the URL's last
  // segment plus an extension guessed from the type, so every file saved as `raw.<ext>` (#2040).
  // BEFORE the Range branch so the 206 carries it too — a media save takes the partial response.
  // `inline`, not `attachment`: this route is how the app RENDERS images, PDFs and text, and
  // `attachment` would turn every one of those into a download.
  const advertised = servedFileName(rel);
  if (advertised !== null) res.setHeader("Content-Disposition", contentDisposition(advertised, { type: "inline" }));

  // Range support (required for <video>/<audio> seeking in Safari).
  const rangeHeader = req.headers.range;
  if (rangeHeader) {
    const range = parseByteRange(rangeHeader, stat.size);
    // A well-formed but unsatisfiable range earns a 416; a malformed / unsupported one is
    // ignored (fall through to the full 200), per RFC 7233 — a 416 breaks a media seek.
    if (range.kind === "unsatisfiable") {
      res.status(416).setHeader("Content-Range", `bytes */${stat.size}`);
      res.json({ error: "range not satisfiable" });
      return;
    }
    if (range.kind === "range") {
      res.status(206);
      res.setHeader("Content-Range", `bytes ${range.start}-${range.end}/${stat.size}`);
      res.setHeader("Content-Length", String(range.end - range.start + 1));
      streamFileToResponse(abs, res, { start: range.start, end: range.end });
      return;
    }
    // range.kind === "ignore" → serve the whole file below.
  }

  res.setHeader("Content-Length", String(stat.size));
  streamFileToResponse(abs, res);
}
