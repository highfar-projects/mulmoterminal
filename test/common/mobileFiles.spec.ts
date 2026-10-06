// @vitest-environment node
import { describe, it, expect } from "vitest";
import {
  MOBILE_FILE_EXTENSIONS,
  MOBILE_FILE_EXTENSION_PATTERN,
  extensionOf,
  isServableMobilePath,
  mobileFileContentType,
  mobileFileKind,
  normalizeMobileFileExtensions,
} from "../../common/mobileFiles";

describe("normalizeMobileFileExtensions", () => {
  it("trims, lowercases, drops a leading dot and dedupes", () => {
    expect(normalizeMobileFileExtensions([" .MD ", "md", "Pdf", ".png"])).toEqual(["md", "pdf", "png"]);
  });

  it("keeps only the host's allowlist, whatever the project asks for", () => {
    expect(normalizeMobileFileExtensions(["env", "json", "svg", "sh", "html"])).toEqual(["html"]);
  });

  it.each([[undefined], [null], ["md"], [{ md: true }], [42]])("is empty for a non-array (%s)", (input) => {
    expect(normalizeMobileFileExtensions(input)).toEqual([]);
  });

  it("skips non-string entries", () => {
    expect(normalizeMobileFileExtensions([1, null, {}, "pdf"])).toEqual(["pdf"]);
  });
});

describe("extensionOf / kind / content type", () => {
  it.each([
    ["a/b/report.PDF", "pdf"],
    ["notes.tar.md", "md"],
    ["README", ""],
    [".md", ""],
    ["dir.v2/file", ""],
  ])("%s -> %s", (input, expected) => {
    expect(extensionOf(input)).toBe(expected);
  });

  it("maps every served extension to a kind and a type, and nothing else", () => {
    expect(mobileFileKind("x.htm")).toBe("html");
    expect(mobileFileKind("x.jpeg")).toBe("image");
    expect(mobileFileKind("x.svg")).toBeNull();
    expect(mobileFileContentType("x.pdf")).toBe("application/pdf");
    expect(mobileFileContentType("x.exe")).toBe("application/octet-stream");
  });
});

describe("isServableMobilePath", () => {
  const md = ["md" as const];

  it("accepts a declared extension at any depth", () => {
    expect(isServableMobilePath("a.md", md)).toBe(true);
    expect(isServableMobilePath("deep/er/a.MD", md)).toBe(true);
  });

  it.each(["a.pdf", "a", "a.md.bak"])("refuses an undeclared extension (%s)", (input) => {
    expect(isServableMobilePath(input, md)).toBe(false);
  });

  it.each(["node_modules/x.md", "a/node_modules/b.md", ".secret.md", ".git/x.md", "a/.hidden/b.md", "../a.md", "a/../b.md", "a//b.md", "/a.md", ""])(
    "refuses %j",
    (input) => {
      expect(isServableMobilePath(input, md)).toBe(false);
    },
  );
});

describe("MOBILE_FILE_EXTENSION_PATTERN", () => {
  it("accepts exactly what normalizeMobileFileExtensions keeps, in any spelling", () => {
    MOBILE_FILE_EXTENSIONS.forEach((extension) => {
      [extension, `.${extension}`, extension.toUpperCase(), ` .${extension} `].forEach((written) => {
        expect(MOBILE_FILE_EXTENSION_PATTERN.test(written)).toBe(true);
        expect(normalizeMobileFileExtensions([written])).toEqual([extension]);
      });
    });
  });

  it.each(["svg", "env", "json", "mdx", "..md", "md.", "", "h tml"])("refuses %j, as the loader does", (written) => {
    expect(MOBILE_FILE_EXTENSION_PATTERN.test(written)).toBe(false);
    expect(normalizeMobileFileExtensions([written])).toEqual([]);
  });
});
