import { describe, it, expect } from "vitest";
import { FILES_PAGE_ROUTE, filesPageRequest, filesPageUrl } from "../../common/filesPage";

const tailOf = (url: string): string => url.slice(FILES_PAGE_ROUTE.length + 1);

// #2269. The pane builds this URL and the server reads it back; a page's relative links resolve
// against it, so the base has to stay one segment and the path has to stay the page's directory.
describe("filesPage URLs", () => {
  it.each([
    ["/Users/me/proj", "report.html"],
    ["/Users/me/proj", "docs/weekly report.html"],
    ["C:\\Users\\me\\proj", "out/グラフ.html"],
    ["/tmp/a b", "x/y/z.htm"],
  ])("reads back %s + %s", (cwd, pathRel) => {
    expect(filesPageRequest(tailOf(filesPageUrl(cwd, pathRel)))).toEqual({ cwd, pathRel });
  });

  it("keeps the base as one segment, so a relative link stays under it", () => {
    const url = filesPageUrl("/Users/me/proj", "docs/report.html");
    const linked = new URL("chart.png", `http://h${url}`).pathname;
    expect(filesPageRequest(tailOf(linked))).toEqual({ cwd: "/Users/me/proj", pathRel: "docs/chart.png" });
  });

  it.each([
    ["an encoded slash inside a segment", `${encodeURIComponent("/p")}/a%2Fb.html`],
    ["an encoded backslash inside a segment", `${encodeURIComponent("/p")}/a%5Cb.html`],
    ["a base with no path", encodeURIComponent("/p")],
    ["an empty segment", `${encodeURIComponent("/p")}//a.html`],
    ["a malformed escape", `${encodeURIComponent("/p")}/%E0%A4%A.html`],
    ["an empty base", "/a.html"],
  ])("names nothing for %s", (_label, tail) => {
    expect(filesPageRequest(tail)).toBeNull();
  });
});
