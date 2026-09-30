import { describe, it, expect } from "vitest";
import { compareVersions, guideLanguageFor, MAX_WHATS_NEW_VERSIONS, parseWhatsNew, versionsToShow } from "../../common/whatsNew";

describe("compareVersions", () => {
  it.each([
    ["4.10.0", "4.9.0", 1],
    ["4.9.0", "4.10.0", -1],
    ["7.1.0", "7.1.0", 0],
    ["7.1.0-beta.1", "7.1.0", 0],
    ["8.0.0", "7.99.99", 1],
    ["1.2", "1.2.0", 0],
  ])("%s vs %s", (left, right, sign) => {
    expect(Math.sign(compareVersions(left, right))).toBe(sign);
  });
});

describe("versionsToShow", () => {
  const released = ["6.9.0", "7.0.0", "7.0.1", "7.1.0", "7.2.0"];

  it("lists every version after the last seen one up to the running one, newest first", () => {
    expect(versionsToShow(released, "6.9.0", "7.1.0")).toEqual({ versions: ["7.1.0", "7.0.1", "7.0.0"], truncated: false });
  });

  it("shows nothing when the running version was already seen", () => {
    expect(versionsToShow(released, "7.1.0", "7.1.0").versions).toEqual([]);
  });

  it("shows nothing after a downgrade", () => {
    expect(versionsToShow(released, "7.2.0", "7.1.0").versions).toEqual([]);
  });

  it("never shows a guide newer than the running version", () => {
    expect(versionsToShow(released, "7.0.1", "7.1.0").versions).toEqual(["7.1.0"]);
  });

  it("shows nothing when nothing was remembered", () => {
    expect(versionsToShow(released, null, "7.1.0")).toEqual({ versions: [], truncated: false });
  });

  it("sorts numerically, not as text", () => {
    expect(versionsToShow(["4.9.0", "4.10.0", "4.2.0"], "4.1.0", "4.10.0").versions).toEqual(["4.10.0", "4.9.0", "4.2.0"]);
  });

  it("keeps the newest ones and says so when there are too many", () => {
    const many = Array.from({ length: MAX_WHATS_NEW_VERSIONS + 3 }, (_unused, index) => `5.${index}.0`);
    const shown = versionsToShow(many, "4.0.0", `5.${MAX_WHATS_NEW_VERSIONS + 2}.0`);
    expect(shown.truncated).toBe(true);
    expect(shown.versions).toHaveLength(MAX_WHATS_NEW_VERSIONS);
    expect(shown.versions[0]).toBe(`5.${MAX_WHATS_NEW_VERSIONS + 2}.0`);
  });

  it("is not truncated at exactly the cap", () => {
    const exact = Array.from({ length: MAX_WHATS_NEW_VERSIONS }, (_unused, index) => `5.${index}.0`);
    expect(versionsToShow(exact, "4.0.0", `5.${MAX_WHATS_NEW_VERSIONS - 1}.0`).truncated).toBe(false);
  });

  it("handles an empty list", () => {
    expect(versionsToShow([], "1.0.0", "2.0.0")).toEqual({ versions: [], truncated: false });
  });
});

describe("guideLanguageFor", () => {
  it.each([
    ["ja", "ja"],
    ["en", "en"],
    ["ko", "en"],
    ["zh-CN", "en"],
    ["", "en"],
  ])("%s reads %s", (locale, language) => {
    expect(guideLanguageFor(locale)).toBe(language);
  });
});

describe("parseWhatsNew", () => {
  const entry = { version: "7.1.0", title: "T", markdown: "m", url: "https://x" };

  it("reads a well-formed body", () => {
    expect(parseWhatsNew({ version: "7.1.0", entries: [entry], truncated: true })).toEqual({ version: "7.1.0", entries: [entry], truncated: true });
  });

  it("drops malformed entries and treats a missing flag as not truncated", () => {
    expect(parseWhatsNew({ version: "7.1.0", entries: [entry, { version: 1 }, null] })).toEqual({ version: "7.1.0", entries: [entry], truncated: false });
  });

  it.each([[null], ["x"], [{}], [{ version: "7.1.0" }], [{ version: 7, entries: [] }], [{ version: "7.1.0", entries: {} }]])("rejects %j", (body) => {
    expect(parseWhatsNew(body)).toBeNull();
  });
});
