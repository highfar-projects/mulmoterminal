// @vitest-environment node
//
// The page starts with index.html's <title> and replaces it with windowTitleFor() once the config
// arrives. A base that differed from index.html would make the title change on load for a Windows
// server too, which is exactly the server whose title is supposed to stay as it was.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { BASE_WINDOW_TITLE } from "../../common/windowTitle";

describe("index.html's <title>", () => {
  it("is the base window title", () => {
    const html = readFileSync(path.join(process.cwd(), "index.html"), "utf8");
    expect(html).toContain(`<title>${BASE_WINDOW_TITLE}</title>`);
  });
});
