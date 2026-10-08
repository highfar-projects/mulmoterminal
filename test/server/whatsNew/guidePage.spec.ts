// @vitest-environment node
import { describe, it, expect } from "vitest";
import { guidePageUrl, toWhatsNewEntry } from "../../../server/whatsNew/guidePage.js";

const PAGE = `---
title: 7.1.0 — The Files pane keeps history
layout: default
parent: English
nav_order: 9999909
---

# 7.1.0 — The Files pane keeps history

Intro.

![shot](../images/v7.1.0-outline.png)

See [the guide](features.html#edit-files) and [config](config.html#keymap "Keymap").
[External](https://example.com/a) and [mail](mailto:a@b.c) stay.
`;

describe("toWhatsNewEntry", () => {
  const entry = toWhatsNewEntry(PAGE, "en", "7.1.0");

  it("takes the title from the front matter and drops the repeated heading", () => {
    expect(entry.title).toBe("7.1.0 — The Files pane keeps history");
    expect(entry.markdown.startsWith("Intro.")).toBe(true);
    expect(entry.markdown).not.toContain("layout:");
  });

  it("points images at the published guide site", () => {
    expect(entry.markdown).toContain("![shot](https://www.mulmoterminal.com/guide/images/v7.1.0-outline.png)");
  });

  it("resolves page links against the page, keeping anchors and titles", () => {
    expect(entry.markdown).toContain("[the guide](https://www.mulmoterminal.com/guide/en/features.html#edit-files)");
    expect(entry.markdown).toContain('[config](https://www.mulmoterminal.com/guide/en/config.html#keymap "Keymap")');
  });

  it("leaves absolute links alone", () => {
    expect(entry.markdown).toContain("[External](https://example.com/a)");
    expect(entry.markdown).toContain("[mail](mailto:a@b.c)");
  });

  it("links to the published page", () => {
    expect(entry.url).toBe(guidePageUrl("en", "7.1.0"));
    expect(entry.url).toBe("https://www.mulmoterminal.com/guide/en/v7.1.0.html");
  });

  it("resolves Japanese pages under the ja directory", () => {
    expect(toWhatsNewEntry("[a](basics.html)", "ja", "7.1.0").markdown).toBe("[a](https://www.mulmoterminal.com/guide/ja/basics.html)");
  });

  it("falls back to the version as a title when there is no front matter", () => {
    const bare = toWhatsNewEntry("# Heading\n\nBody", "en", "1.0.0");
    expect(bare.title).toBe("1.0.0");
    expect(bare.markdown).toBe("Body");
  });

  it("unquotes a quoted title", () => {
    expect(toWhatsNewEntry('---\ntitle: "Quoted: yes"\n---\nBody', "en", "1.0.0").title).toBe("Quoted: yes");
  });

  it("reads CRLF front matter", () => {
    expect(toWhatsNewEntry("---\r\ntitle: CRLF\r\n---\r\nBody", "en", "1.0.0").title).toBe("CRLF");
  });

  it("handles an empty page", () => {
    expect(toWhatsNewEntry("", "en", "1.0.0")).toEqual({ version: "1.0.0", title: "1.0.0", markdown: "", url: guidePageUrl("en", "1.0.0") });
  });
});
