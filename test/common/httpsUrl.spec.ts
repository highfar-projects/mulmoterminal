// @vitest-environment node
import { describe, it, expect } from "vitest";
import { safeHttpsUrl } from "../../common/httpsUrl";

describe("safeHttpsUrl", () => {
  it.each(["https://github.com/o/r/pull/1", "HTTPS://GITHUB.EXAMPLE/o/r", "https://ci.example/run?id=1#log"])("keeps the https URL %s", (url) => {
    expect(safeHttpsUrl(url)).toBe(url);
  });

  it.each([
    "javascript:alert(1)",
    "JavaScript:alert(1)",
    " javascript:alert(1)",
    "data:text/html,<script>alert(1)</script>",
    "http://ci.example/run",
    "file:///etc/passwd",
    "//github.com/o/r",
    "/api/files",
    "not a url",
    "",
  ])("refuses %j", (url) => {
    expect(safeHttpsUrl(url)).toBeNull();
  });

  it.each([null, undefined, 1, {}, ["https://github.com"]])("refuses the non-string %j", (value) => {
    expect(safeHttpsUrl(value)).toBeNull();
  });
});
