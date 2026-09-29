// @vitest-environment node
// A usecase may name the report the run view shows: only a Markdown file directly under the build's own
// .blueprint/ folder, so a pack (possibly one installed from the market) cannot point the view anywhere else.
import { describe, expect, it } from "vitest";
import { REPORT_PATH_RE, baseManifestSchema, inPackOrder, reportOf, usecaseManifestSchema, type BlueprintManifest } from "../../../common/blueprint/manifest";

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

const base = (report?: string) => ({
  slug: "local",
  kind: "base",
  title: "t",
  version: "0.1.0",
  description: "",
  platform: "local",
  ...(report ? { report } : {}),
});

describe("a base's report", () => {
  it("takes the same paths as a usecase's", () => {
    expect(baseManifestSchema.safeParse(base(".blueprint/start-here.md")).success).toBe(true);
    expect(baseManifestSchema.safeParse(base(".blueprint/../x.md")).success).toBe(false);
    expect(baseManifestSchema.safeParse(base()).success).toBe(true);
  });
});

describe("reportOf", () => {
  const u = (report?: string): BlueprintManifest => usecaseManifestSchema.parse(usecase(report));
  const b = (report?: string): BlueprintManifest => baseManifestSchema.parse(base(report));

  it("prefers the usecase's own report", () =>
    expect(reportOf(u(".blueprint/review-report.md"), b(".blueprint/start-here.md"))).toBe(".blueprint/review-report.md"));
  it("falls back to the base's", () => expect(reportOf(u(), b(".blueprint/start-here.md"))).toBe(".blueprint/start-here.md"));
  it("is null when neither names one", () => expect(reportOf(u(), b())).toBeNull());
  it("keeps the usecase's report when the base cannot be read", () => expect(reportOf(u(".blueprint/replies.md"), null)).toBe(".blueprint/replies.md"));
  it("is null when the base cannot be read and the usecase names none", () => expect(reportOf(u(), null)).toBeNull());
  it("is null when the usecase cannot be read", () => expect(reportOf(null, b(".blueprint/start-here.md"))).toBeNull());
  it("is null when the packs are the wrong way round", () => expect(reportOf(b(".blueprint/start-here.md"), u(".blueprint/replies.md"))).toBeNull());
});

describe("inPackOrder", () => {
  const pack = (slug: string, order?: number) => ({ slug, manifest: order === undefined ? {} : { order } });

  it("puts packs with an order first, lowest first, then the rest by slug, whatever order they arrive in", () => {
    const packs = [pack("repo"), pack("cloudflare"), pack("local"), pack("docs", 1), pack("firebase"), pack("zeta", 0)];
    expect(inPackOrder(packs).map((entry) => entry.slug)).toEqual(["zeta", "docs", "cloudflare", "firebase", "local", "repo"]);
    expect(inPackOrder([...packs].reverse()).map((entry) => entry.slug)).toEqual(["zeta", "docs", "cloudflare", "firebase", "local", "repo"]);
  });

  it("sorts slugs by code unit, not by the machine's locale, and leaves the list it was given alone", () => {
    const packs = [pack("b"), pack("B"), pack("a")];
    expect(inPackOrder(packs).map((entry) => entry.slug)).toEqual(["B", "a", "b"]);
    expect(packs.map((entry) => entry.slug)).toEqual(["b", "B", "a"]);
  });
});
