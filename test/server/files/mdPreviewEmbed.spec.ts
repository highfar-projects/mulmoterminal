// @vitest-environment node
import { describe, it, expect } from "vitest";
import ts from "typescript";
import { mdPreviewEmbedCsp, mdPreviewReporterTag, newPreviewNonce, wantsMdPreviewEmbed } from "../../../server/files/mdPreviewEmbed";
import { MD_PREVIEW_FROM_FRAME, MD_PREVIEW_FROM_HOST } from "../../../common/mdPreviewMessage";

// #2157. The preview document has to run ONE script — ours — while a `.md` this server never
// sanitised sits in the same document and must go on running none. These are the pieces that
// promise arrives as: the policy, the nonce, and the script the nonce lets through.

describe("wantsMdPreviewEmbed", () => {
  it("recognises the opt-in", () => {
    expect(wantsMdPreviewEmbed("1")).toBe(true);
  });

  // The default must be the closed document, so anything that is not the exact opt-in is one.
  // `?embed=0` loosening a policy is the shape this guards against.
  it.each([["0"], ["true"], [""], ["2"]])("does not read %j as the opt-in", (value) => {
    expect(wantsMdPreviewEmbed(value)).toBe(false);
  });

  // Express hands back an array for a repeated parameter and an object for `embed[x]=1`; neither
  // is the opt-in, and neither may throw on the way to being refused.
  it.each([[undefined], [null], [["1"]], [{ x: "1" }], [1]])("does not read %j as the opt-in", (value) => {
    expect(wantsMdPreviewEmbed(value)).toBe(false);
  });
});

describe("newPreviewNonce", () => {
  // The nonce is the whole separation between our script and the file's. A repeat would mean a
  // `.md` that has seen one response can name the nonce of the next.
  it("is a fresh value every time", () => {
    const seen = new Set(Array.from({ length: 200 }, () => newPreviewNonce()));
    expect(seen.size).toBe(200);
  });

  // base64url, so the same string is valid in a CSP source expression and in an HTML attribute
  // with no escaping between them.
  it("needs no escaping in either place it is written", () => {
    expect(newPreviewNonce()).toMatch(/^[A-Za-z0-9_-]+$/);
  });
});

describe("mdPreviewEmbedCsp", () => {
  it("lets scripts run", () => {
    expect(mdPreviewEmbedCsp("n1")).toContain("sandbox allow-scripts");
  });

  // The point of the whole design: scripts, never an origin. If this ever passes, an unsanitised
  // `.md` is a document on the app's own origin.
  it("never grants the document an origin", () => {
    expect(mdPreviewEmbedCsp("n1")).not.toContain("allow-same-origin");
  });

  // And the other half: `allow-scripts` alone would run whatever the file contains. Only the
  // nonce may name a runnable script — no host, no scheme, and above all no 'unsafe-inline'.
  it("admits the nonce and nothing else", () => {
    expect(mdPreviewEmbedCsp("n1")).toContain("script-src 'nonce-n1'");
    expect(mdPreviewEmbedCsp("n1")).not.toContain("unsafe-inline");
    expect(mdPreviewEmbedCsp("n1")).not.toContain("unsafe-eval");
    expect(mdPreviewEmbedCsp("n1")).not.toContain("self");
  });
});

/** The script's own source, as the browser will see it once the element is parsed. */
const reporterSourceOf = (nonce: string): string =>
  mdPreviewReporterTag(nonce)
    .replace(new RegExp(`^<script nonce="${nonce}">`), "")
    .replace(/<\/script>$/, "");

describe("mdPreviewReporterTag", () => {
  it("declares the nonce it was given", () => {
    expect(mdPreviewReporterTag("n1")).toContain('<script nonce="n1">');
  });

  // Both directions of the wire, spelled the way the pane recognises them. The script is a
  // STRING here and a program in the browser, so a name that drifted would fail silently.
  it("speaks the names the host listens for", () => {
    const tag = mdPreviewReporterTag("n1");
    expect(tag).toContain(MD_PREVIEW_FROM_FRAME);
    expect(tag).toContain(MD_PREVIEW_FROM_HOST);
    expect(tag).toContain('kind: "ready"');
    expect(tag).toContain('kind: "scroll"');
  });

  // It measures a document rendered from the file; it must never be built out of one. Nothing
  // varies with the file, so the only per-response value in it is the nonce.
  it("carries nothing but the nonce from outside itself", () => {
    expect(mdPreviewReporterTag("AAAA").replace("AAAA", "BBBB")).toBe(mdPreviewReporterTag("BBBB"));
  });

  // A closing tag anywhere in the source would end the element early and drop the rest of the
  // script into the page as text.
  it("does not end its own element", () => {
    expect(mdPreviewReporterTag("n1").match(/<\/script>/g)).toHaveLength(1);
  });

  // The reporter is a STRING here and a program only in the browser, so nothing between the two
  // would notice a syntax error — the preview would simply stop remembering, with no failure
  // anywhere. This is the one thing that reads it as code.
  it("parses as a program", () => {
    // Parsed, never run — and parsed by the compiler this repo already builds with, so the check
    // costs no dependency and cannot execute what it is reading.
    const { diagnostics } = ts.transpileModule(reporterSourceOf("n1"), { reportDiagnostics: true });
    expect(diagnostics?.map((d) => ts.flattenDiagnosticMessageText(d.messageText, " "))).toEqual([]);
  });

  // It runs at the end of the body of a document it did not write, where a bare `const` or a
  // stray global would collide with whatever the file's own HTML brought in.
  it("declares nothing outside itself", () => {
    const source = reporterSourceOf("n1");
    expect(source.startsWith("(() => {")).toBe(true);
    expect(source.trimEnd().endsWith("})();")).toBe(true);
  });
});
