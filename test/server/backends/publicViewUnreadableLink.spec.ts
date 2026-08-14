// @vitest-environment node
//
// What the published-view gate does when it cannot TELL whether the file is a link.
//
// Its own file covers this because the answer needs `lstat` to fail, which needs the
// module mocked — and mocking it for the whole of publicView.spec.ts would take the
// real filesystem away from every symlink case there, which is the thing those cases
// are about.
import { describe, it, expect, vi } from "vitest";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

// Fails the way a Windows reparse point libuv cannot classify does: an error that is
// NOT "there is nothing here", on a path `open` would go on reading perfectly well.
// Only this one basename, so the ancestor walk above it keeps the real filesystem.
vi.mock("node:fs/promises", async (importOriginal) => {
  const real = await importOriginal<typeof import("node:fs/promises")>();
  return {
    ...real,
    lstat: (target: string) =>
      path.basename(String(target)) === "uninspectable.html"
        ? Promise.reject(Object.assign(new Error("EPERM: operation not permitted, lstat"), { code: "EPERM" }))
        : real.lstat(target),
  };
});

const STAMP = 1_700_000_000_000;

describe("a view whose last component cannot be inspected", () => {
  it("is refused rather than opened, though opening it would have worked", async () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "mt-public-view-uninspectable-"));
    mkdirSync(path.join(root, "views"));
    writeFileSync(path.join(root, "views", "uninspectable.html"), "<p>would have been published</p>");

    const { readAppViewFile } = await import("../../../server/backends/sharedApp/publicView.js");
    const result = await readAppViewFile(root, { path: "views/uninspectable.html" }, STAMP);

    // Fails CLOSED. Treating the error as "not a link" would hand the decision to
    // `open`, which on a platform without O_NOFOLLOW makes no such decision (#1709).
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.problems.join(" ")).toContain("could not be checked for being a link");
    expect(result.ok === false && result.problems.join(" ")).toContain("without following links");
    // And nothing of the file it declined to judge comes back with the refusal.
    expect(JSON.stringify(result)).not.toContain("would have been published");
  });
});
