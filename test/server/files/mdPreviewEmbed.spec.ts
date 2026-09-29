// @vitest-environment node
import { describe, it, expect } from "vitest";
import ts from "typescript";
import { mdPreviewEmbedCsp, newPreviewNonce, wantsMdPreviewEmbed } from "../../../server/files/mdPreviewEmbed";
import { mdPreviewReporterTag } from "../../../server/files/mdPreviewReporter";
import { EXTERNAL_HREF, MD_PREVIEW_FROM_FRAME, MD_PREVIEW_FROM_HOST, OTHER_SCHEME_HREF } from "../../../common/mdPreviewMessage";

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

  // The half that cost the most to find: a `scrollTo` into a page that has no layout yet is
  // clamped to the top, so the place has to be applied AGAIN when the page grows. `resize` is not
  // that signal — a frame hidden with `display:none` keeps its `innerHeight` — so the document
  // watches its own height.
  it("re-applies the place when the page grows under it", () => {
    const source = reporterSourceOf("n1");
    expect(source).toContain("ResizeObserver");
    expect(source).toContain("document.documentElement");
    expect(source).not.toContain("'resize'");
  });

  // And stops re-applying once the reader has taken over, or every scroll of theirs would be
  // undone by the next image that loads.
  it("stops re-applying once the reader has scrolled", () => {
    const source = reporterSourceOf("n1");
    const watch = source.slice(source.indexOf("new ResizeObserver("));
    expect(watch.indexOf("if (readerMoved) return;")).toBeGreaterThan(-1);
    expect(watch.indexOf("if (readerMoved) return;")).toBeLessThan(watch.indexOf("applyPlace();"));
  });

  // It measures a document rendered from the file; it must never be built out of one. Nothing
  // varies with the file, so the only per-response value in it is the nonce.
  it("carries nothing but the nonce from outside itself", () => {
    expect(mdPreviewReporterTag("AAAA").replace("AAAA", "BBBB")).toBe(mdPreviewReporterTag("BBBB"));
  });

  // #2259. An external link is posted to the host, which opens it; the frame itself has no
  // `allow-popups`. Behaviour was checked in a real browser (see the PR); this pins the pieces.
  it("hands an external link to the host instead of following it", () => {
    const source = reporterSourceOf("n1");
    expect(source).toContain("addEventListener('click'");
    expect(source).toContain("closest('a[href]')");
    expect(source).toContain("event.preventDefault()");
  });

  // #2268. A link to another file is handed over too, as written — the frame's own URL is this
  // server's route, so following it there is a 404. The patterns are the ones common/ exports,
  // built into the script, so these two lines and the specs on the patterns read the same rule.
  it("hands a link to another file to the host, leaving anchors and other schemes alone", () => {
    const source = reporterSourceOf("n1");
    expect(source).toContain("if (!href || href.startsWith('#')) return;");
    expect(source).toContain(`const external = ${EXTERNAL_HREF}.test(href);`);
    expect(source).toContain(`if (!external && ${OTHER_SCHEME_HREF}.test(href)) return;`);
    expect(source).toContain('post(external ? { kind: "navigate", href } : { kind: "open", href });');
  });

  // Decided on the attribute AS WRITTEN.
  it("recognises only an absolute http(s) href as external", () => {
    expect(["https://a.example/", "HTTP://a.example"].map((href) => EXTERNAL_HREF.test(href))).toEqual([true, true]);
    expect(["docs/a.md", "/abs", "#top", "mailto:a@b", "javascript:void(0)", "//cdn.example/x"].map((href) => EXTERNAL_HREF.test(href))).toEqual([
      false,
      false,
      false,
      false,
      false,
      false,
    ]);
  });

  // What is left to the browser: every href naming a scheme or a host. A path, relative or from
  // the root, is not one — that is what the host opens as a file.
  it("leaves another scheme or another host to the browser, and nothing that is a path", () => {
    expect(
      ["mailto:a@b", "javascript:void(0)", "//cdn.example/x", "file:///etc/hosts", "https://a.example/"].map((href) => OTHER_SCHEME_HREF.test(href)),
    ).toEqual([true, true, true, true, true]);
    expect(["docs/a.md", "./b.md", "../c.md", "/abs.md", "my file.md"].map((href) => OTHER_SCHEME_HREF.test(href))).toEqual([
      false,
      false,
      false,
      false,
      false,
    ]);
  });

  // #2579. Copy buttons appear only once the host sends their words, and a click hands the block's
  // text to the host rather than touching a clipboard this origin-less document cannot have.
  it("adds copy buttons with the host's words and hands the click to the host", () => {
    const source = reporterSourceOf("n1");
    expect(source).toContain("if (isCopyLabels(data.copyLabels))");
    expect(source).toContain("document.querySelectorAll('pre > code')");
    expect(source).toContain("button.textContent = copyLabels.copy;");
    expect(source).toContain('post({ kind: "copy", text: copyText(copyButton), block: Number(copyButton.dataset.block) });');
    expect(source).toContain("if (typeof data.copied === 'number')");
    expect(source).not.toContain("navigator.clipboard");
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

// #2576. The outline's pick in the Preview: by position, checked against the text, from the parent
// only, and reported back as the new place. Driven in a real browser in the PR's verification.
describe("the reporter's heading jump", () => {
  const tag = mdPreviewReporterTag("n1");

  it("answers a heading request from its parent with a scroll to that heading", () => {
    expect(tag).toContain("typeof data.heading === 'number' && typeof data.headingText === 'string'");
    expect(tag).toContain("document.querySelectorAll('h1, h2, h3, h4, h5, h6')");
    expect(tag).toContain('post({ kind: "scroll", scrollY: place });');
  });

  // The pick's heading is followed while images load above it, until the reader scrolls themselves.
  it("keeps the picked heading as the place until the reader scrolls", () => {
    expect(tag).toContain("anchor = target;");
    expect(tag).toContain("if (anchor) place = Math.max(0, Math.round(anchor.getBoundingClientRect().top + scrollY));");
    expect(tag).toContain("readerMoved = true;\n  anchor = null;");
    // Not while the frame is hidden: a heading with no box measures 0.
    expect(tag).toContain("if (anchor && anchor.getClientRects().length === 0) return;");
  });

  it("checks the heading at that position against the text before trusting it", () => {
    expect(tag).toContain("if (at && norm(at.textContent) === norm(text)) return at;");
    expect(tag).toContain("return same[occurrence] || same.find((h) => all.indexOf(h) >= index) || same[0] || at;");
  });

  it("still parses as a program with the heading branch in it", () => {
    const body = tag.replace(/^<script[^>]*>/, "").replace(/<\/script>$/, "");
    const diagnostics = ts.transpileModule(body, { reportDiagnostics: true, compilerOptions: { allowJs: true } }).diagnostics ?? [];
    expect(diagnostics).toEqual([]);
  });
});

// #2515. Every message carries the token the host gave this document; a page the frame is navigated
// to has none. The token reaches a script, so only a well-formed one is written into it, quoted.
describe("the reporter's token", () => {
  const TOKEN = "0123456789abcdef-wire";

  it("stamps every message it posts with the token it was given", () => {
    const source = mdPreviewReporterTag("n1", TOKEN);
    expect(source).toContain(`token: ${JSON.stringify(TOKEN)}`);
    expect(source.match(/parent\.postMessage\(/g)).toHaveLength(1); // the one `post`, which every message goes through
  });

  it.each([
    ["none", undefined],
    ["an empty one", ""],
    ["one too short", "short"],
    ["one that would close the script", '"});</script><script>alert(1)//xxxx'],
  ])("stamps null for %s", (_label, token) => {
    const tag = mdPreviewReporterTag("n1", token);
    expect(tag).toContain("token: null");
    expect(tag.match(/<\/script>/g)).toHaveLength(1);
  });
});
