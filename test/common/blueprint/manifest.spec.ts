// @vitest-environment node
// A usecase may name the report the run view shows: only a Markdown file directly under the build's own
// .blueprint/ folder, so a pack (possibly one installed from the market) cannot point the view anywhere else.
import { describe, expect, it } from "vitest";
import { REPORT_PATH_RE, usecaseManifestSchema } from "../../../common/blueprint/manifest";

const usecase = (report?: string) => ({
  slug: "review",
  kind: "usecase",
  title: "t",
  version: "0.1.0",
  description: "",
  bases: ["docs"],
  ...(report ? { report } : {}),
});

describe("a usecase's report", () => {
  it.each([".blueprint/review-report.md", ".blueprint/replies.md", ".blueprint/a_b-1.md"])("accepts %s", (report) => {
    expect(REPORT_PATH_RE.test(report)).toBe(true);
    expect(usecaseManifestSchema.safeParse(usecase(report)).success).toBe(true);
  });

  it.each([".blueprint/../x.md", "/etc/passwd", "README.md", ".blueprint/x.txt", ".blueprint/sub/x.md", ".blueprint/.hidden.md", ".blueprint/"])(
    "refuses %s",
    (report) => expect(usecaseManifestSchema.safeParse(usecase(report)).success).toBe(false),
  );

  it("is optional", () => expect(usecaseManifestSchema.safeParse(usecase()).success).toBe(true));
});
