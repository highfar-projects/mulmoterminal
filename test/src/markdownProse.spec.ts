// @vitest-environment jsdom
//
// What a rendered reply may reach out to (#2115).
//
// An agent's reply is markdown that passes through `marked` and then DOMPurify, and RAW HTML in it
// survives both. Anything the browser fetches on sight — an image, a `srcset`, a `<video poster>`,
// a CSS background — therefore tells that host the reader's address and the moment they opened the
// pane, and the reply's author need not be anyone here: agents read the web and other people's
// repositories.
//
// The rule is stated as what is PERMITTED, so this file's job is to pin BOTH directions: the shapes
// that must not fetch, and the ordinary prose that must still render. A guard asserting "no evil
// host anywhere" is green just as easily when the renderer has stopped rendering.
import { describe, it, expect } from "vitest";
import { renderMarkdownProse } from "../../src/markdownProse";

const REMOTE = "https://tracker.example/p.png";

describe("renderMarkdownProse — what it may fetch", () => {
  it.each([
    ["a markdown image", `![alt](${REMOTE})`],
    ["a raw img", `<img src="${REMOTE}">`],
    ["a srcset", `<img srcset="${REMOTE} 1x" src="data:image/gif;base64,R0lGOD">`],
    ["a picture source", `<picture><source srcset="${REMOTE}"><img src="data:image/gif;base64,R0lGOD"></picture>`],
    ["a video poster", `<video poster="${REMOTE}"></video>`],
    ["an audio src", `<audio src="${REMOTE}"></audio>`],
    ["a track", `<track src="${REMOTE}">`],
    ["an image input", `<input type="image" src="${REMOTE}">`],
    ["a css background", `<div style="background-image:url(${REMOTE})">x</div>`],
    ["a lazy image", `<img loading="lazy" src="${REMOTE}">`],
    ["an svg image", `<svg><image href="${REMOTE}"/></svg>`],
    ["an svg filter image", `<svg><feImage href="${REMOTE}"/></svg>`],
    ["a form action", `<form action="${REMOTE}"><button>go</button></form>`],
    ["a table background", `<table background="${REMOTE}"><tr><td>x</td></tr></table>`],
  ])("does not leave %s in a position the browser fetches", (_case, markdown) => {
    // Asked of the ATTRIBUTES, not of the string: a rewritten link carries the URL as its TEXT when
    // the image had no alt, and text is not a fetch. A string search counts it as one and reports a
    // failure the browser would never make.
    const doc = new DOMParser().parseFromString(renderMarkdownProse(markdown), "text/html");
    const fetching = Array.from(doc.body.querySelectorAll("*")).flatMap((element) =>
      Array.from(element.attributes)
        .filter((attribute) => !(element.tagName === "A" && attribute.name === "href"))
        .map((attribute) => `${element.tagName}.${attribute.name}=${attribute.value}`),
    );
    expect(fetching.filter((pair) => pair.includes("tracker.example"))).toEqual([]);
  });

  it("keeps a remote image reachable as a link rather than dropping it", () => {
    const html = renderMarkdownProse(`![a pixel](${REMOTE})`);
    expect(html).toContain(`href="${REMOTE}"`);
    expect(html).toContain("a pixel");
    expect(html).toContain('target="_blank"');
  });

  // The other direction. Everything below is what an agent writes all day; a permitted-list that
  // quietly eats it would pass every assertion above.
  it.each([
    ["a heading", "## Title", "<h2>"],
    ["bold", "**bold**", "<strong>"],
    ["inline code", "`x`", "<code>"],
    ["a fenced block", "```ts\nconst x = 1;\n```", "<pre>"],
    ["a list", "- one\n- two", "<li>"],
    ["a numbered list that starts late", "7. seven\n8. eight", 'start="7"'],
    ["a table", "| a | b |\n|---|---|\n| 1 | 2 |", "<table>"],
    ["a blockquote", "> quoted", "<blockquote>"],
    ["a rule", "---", "<hr>"],
    ["a task list", "- [x] done", "<input"],
    ["a data image", "![x](data:image/gif;base64,R0lGOD)", "<img"],
    ["a same-origin image", "![x](/local/pic.png)", "<img"],
  ])("still renders %s", (_case, markdown, expected) => {
    expect(renderMarkdownProse(markdown)).toContain(expected);
  });

  it("keeps a task list's checkbox usable as a checkbox", () => {
    const html = renderMarkdownProse("- [x] done");
    expect(html).toContain('type="checkbox"');
    expect(html).toContain("checked");
    expect(html).toContain("disabled");
  });

  it("still strips a script", () => {
    expect(renderMarkdownProse("before<script>window.pwned = 1</script>after")).not.toContain("<script");
  });
});
