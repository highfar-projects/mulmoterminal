// @vitest-environment node
import { describe, it, expect, vi } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  DIR_ICONS_MAX_CHARS,
  DIR_ICON_MAX_BYTES,
  collectDirIcons,
  dirIconSrc,
  readIconFile,
  withDirIcons,
  type DirIconSources,
} from "../../../../server/backends/remoteHost/dirIcons.js";
import type { DirIcon } from "../../../../server/config/dir-icon.js";
import type { TerminalSessionSummary } from "../../../../server/backends/remoteHost/terminalScreen.js";
import { undefinedPaths } from "@mulmoclaude/core/remote-host/server";

const fileIcon = (filePath: string, mime = "image/png"): DirIcon => ({ source: "file", path: filePath, ref: "public/favicon.png", mime });

// A fake filesystem keyed by the resolved path, so the packing rules are exercised without one.
const sourcesFor = (byCwd: Record<string, DirIcon | null>, bytesByPath: Record<string, Buffer> = {}): DirIconSources => ({
  iconOf: (cwd) => byCwd[cwd] ?? null,
  readIcon: (filePath) => bytesByPath[filePath] ?? null,
});

const row = (id: string, cwd: string): TerminalSessionSummary => ({ id, title: id, cwd, live: true, agent: "claude" });

describe("dirIconSrc", () => {
  // A remote source is loaded by the phone itself, exactly as the browser loads it — the host
  // never fetches it, so there is nothing here to read or re-encode.
  it("passes a remote URL through untouched", () => {
    const readIcon = vi.fn(() => null);
    expect(dirIconSrc({ source: "url", url: "https://example.com/logo.svg" }, readIcon)).toBe("https://example.com/logo.svg");
    expect(readIcon).not.toHaveBeenCalled();
  });

  it("inlines a file as a data: URI carrying its own MIME type", () => {
    const bytes = Buffer.from("PNG-ish");
    expect(dirIconSrc(fileIcon("/repo/public/favicon.png"), () => bytes)).toBe(`data:image/png;base64,${bytes.toString("base64")}`);
  });

  // The file was resolved when the config was read; it can be renamed or deleted before the phone
  // asks. That costs the row its picture, never the reply.
  it("answers null when the file cannot be read", () => {
    expect(dirIconSrc(fileIcon("/repo/gone.png"), () => null)).toBeNull();
  });
});

describe("readIconFile", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "mt-icons-"));

  it("reads an ordinary icon", () => {
    const small = path.join(dir, "small.png");
    writeFileSync(small, "tiny");
    expect(readIconFile(small)?.toString()).toBe("tiny");
  });

  // The size comes from stat, so an oversized file is never built into a string first.
  it("refuses one over the per-icon cap", () => {
    const huge = path.join(dir, "huge.png");
    writeFileSync(huge, Buffer.alloc(DIR_ICON_MAX_BYTES + 1));
    expect(readIconFile(huge)).toBeNull();
  });

  it("answers null for a path that is not there", () => {
    expect(readIconFile(path.join(dir, "missing.png"))).toBeNull();
  });
});

describe("collectDirIcons", () => {
  it("gives two directories with the same image one shared id", () => {
    const bytes = Buffer.from("one favicon");
    const icon = fileIcon("/main/favicon.png");
    // Two worktrees of one repository: different directories, different resolved paths, and the
    // same picture — which is the case the content hash exists for.
    const { iconIdByCwd, icons } = collectDirIcons(
      ["/main", "/wt"],
      sourcesFor({ "/main": icon, "/wt": fileIcon("/wt/favicon.png") }, { "/main/favicon.png": bytes, "/wt/favicon.png": bytes }),
    );
    expect(iconIdByCwd.get("/main")).toBe(iconIdByCwd.get("/wt"));
    expect(Object.keys(icons)).toHaveLength(1);
  });

  it("skips a directory with no icon, and an empty cwd", () => {
    const { iconIdByCwd, icons } = collectDirIcons(["", "/plain"], sourcesFor({ "/plain": null }));
    expect(iconIdByCwd.size).toBe(0);
    expect(icons).toEqual({});
  });

  it("skips a directory whose file could not be read", () => {
    const { iconIdByCwd, icons } = collectDirIcons(["/broken"], sourcesFor({ "/broken": fileIcon("/broken/gone.png") }));
    expect(iconIdByCwd.has("/broken")).toBe(false);
    expect(icons).toEqual({});
  });

  // The budget protects the reply, not the individual row: what it refuses is one more DISTINCT
  // image, and the rows before it keep theirs.
  it("stops adding images once the budget is spent, keeping the earlier ones", () => {
    const big = Buffer.alloc(DIR_ICONS_MAX_CHARS, "a"); // base64 of this alone overruns the budget
    const { iconIdByCwd, icons } = collectDirIcons(
      ["/first", "/second"],
      sourcesFor({ "/first": fileIcon("/first/a.png"), "/second": fileIcon("/second/b.png") }, { "/first/a.png": Buffer.from("small"), "/second/b.png": big }),
    );
    expect(iconIdByCwd.has("/first")).toBe(true);
    expect(iconIdByCwd.has("/second")).toBe(false);
    expect(Object.keys(icons)).toHaveLength(1);
  });

  // An id already in the table is free, so a later row sharing it is served even after the
  // budget has refused something else.
  it("still points a later row at an image already in the table", () => {
    const shared = Buffer.from("shared");
    const big = Buffer.alloc(DIR_ICONS_MAX_CHARS, "a");
    const { iconIdByCwd } = collectDirIcons(
      ["/first", "/fat", "/third"],
      sourcesFor(
        { "/first": fileIcon("/first/a.png"), "/fat": fileIcon("/fat/b.png"), "/third": fileIcon("/third/c.png") },
        { "/first/a.png": shared, "/fat/b.png": big, "/third/c.png": shared },
      ),
    );
    expect(iconIdByCwd.get("/third")).toBe(iconIdByCwd.get("/first"));
    expect(iconIdByCwd.has("/fat")).toBe(false);
  });
});

describe("withDirIcons", () => {
  it("names the icon on the rows that have one and leaves the others alone", () => {
    const listing = withDirIcons(
      [row("a", "/repo"), row("b", "/plain")],
      sourcesFor({ "/repo": fileIcon("/repo/favicon.png"), "/plain": null }, { "/repo/favicon.png": Buffer.from("x") }),
    );
    expect(listing.sessions[0].iconId).toBeTypeOf("string");
    expect(listing.icons[String(listing.sessions[0].iconId)]).toBe(`data:image/png;base64,${Buffer.from("x").toString("base64")}`);
    expect(listing.sessions[1].iconId).toBeUndefined();
  });

  // The #1042 shape. `iconId: map.get(cwd)` leaves a key holding `undefined`, which Firestore
  // rejects — taking the whole session list down rather than one row's picture. Asserted with
  // core's own guard, so the test and the shipping check are the same rule.
  it("never leaves an iconId key holding undefined", () => {
    const listing = withDirIcons([row("a", "/plain"), row("b", "")], sourcesFor({ "/plain": null }));
    expect(Object.hasOwn(listing.sessions[0], "iconId")).toBe(false);
    expect(undefinedPaths(listing)).toEqual([]);
  });
});
