import { describe, it, expect } from "vitest";
import { parseUpdateStatus } from "../../common/updateStatus";

describe("parseUpdateStatus", () => {
  // A server that predates the field is upstream's; only an explicit "fork" says otherwise.
  it("reads the distribution, defaulting to upstream", () => {
    const body = { ready: true, install: "npm", version: "4.7.0", commit: null, latest: null, notice: null };
    expect(parseUpdateStatus(body)?.distribution).toBe("upstream");
    expect(parseUpdateStatus({ ...body, distribution: "fork" })?.distribution).toBe("fork");
    expect(parseUpdateStatus({ ...body, distribution: "other" })?.distribution).toBe("upstream");
  });

  it("reads a full status off the wire", () => {
    expect(
      parseUpdateStatus({
        ready: true,
        install: "git",
        version: "4.7.0",
        commit: "a1b2c3d",
        latest: null,
        notice: "Update available: a1b2c3d → origin  ·  run: git pull",
      }),
    ).toEqual({
      ready: true,
      install: "git",
      distribution: "upstream",
      version: "4.7.0",
      commit: "a1b2c3d",
      latest: null,
      notice: "Update available: a1b2c3d → origin  ·  run: git pull",
    });
  });

  // The startup probe has not landed: the version is already true, the rest is not to be read.
  it("keeps a not-ready status readable for its version", () => {
    expect(parseUpdateStatus({ ready: false, install: "npm", version: "4.7.0", commit: null, latest: null, notice: null })?.ready).toBe(false);
  });

  // A body that answered but said nothing usable is not a status. Null keeps the caller on the
  // "nothing to show" path instead of printing a version nobody is on.
  it("is null for a body with no version or no install kind", () => {
    expect(parseUpdateStatus({ install: "npm" })).toBeNull();
    expect(parseUpdateStatus({ version: "4.7.0" })).toBeNull();
    expect(parseUpdateStatus({ install: "svn", version: "4.7.0" })).toBeNull();
    expect(parseUpdateStatus({})).toBeNull();
    expect(parseUpdateStatus(null)).toBeNull();
    expect(parseUpdateStatus("4.7.0")).toBeNull();
  });

  // Optional fields of the wrong type are dropped rather than carried through: a number where a
  // commit belongs would render as one.
  it("drops non-string optional fields", () => {
    expect(parseUpdateStatus({ ready: true, install: "git", version: "4.7.0", commit: 42, latest: {}, notice: [] })).toEqual({
      ready: true,
      install: "git",
      distribution: "upstream",
      version: "4.7.0",
      commit: null,
      latest: null,
      notice: null,
    });
  });

  // Anything other than a literal true is not ready — a missing field must not read as landed.
  it("treats a missing ready flag as not ready", () => {
    expect(parseUpdateStatus({ install: "npm", version: "4.7.0" })?.ready).toBe(false);
  });
});
