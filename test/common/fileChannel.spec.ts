import { describe, it, expect } from "vitest";
import { pluginFileChannel as corePluginFileChannel } from "@mulmoclaude/core/file-change";
import { MARKDOWN_FILE_SCOPE, fileChannelPath, parsePluginFileChannel, pluginFileChannel } from "../../common/fileChannel";

describe("pluginFileChannel", () => {
  it("names one file under one scope", () => {
    expect(pluginFileChannel("markdown", "docs/a.md")).toBe("plugin:markdown:file:docs/a.md");
  });

  // The format belongs to the shared package; this module only restates it for a UI that
  // cannot import it (that entry pulls in node:fs). If core ever respells a channel, the
  // server would publish on one name while the UI listened on another — with nothing failing,
  // because a subscription to a channel nobody publishes on is silent. This is the guard.
  it("spells a channel exactly as the shared publisher does", () => {
    const cases = [
      ["markdown", "docs/a.md"],
      ["html", "artifacts/report.html"],
      ["shapescript", "/abs/models/lamp.shape"],
    ] as const;
    cases.forEach(([scope, path]) => {
      expect(pluginFileChannel(scope, path)).toBe(corePluginFileChannel(scope, path));
    });
  });
});

describe("parsePluginFileChannel", () => {
  it("gives back the scope and the path", () => {
    expect(parsePluginFileChannel("plugin:markdown:file:docs/a.md")).toEqual({ scope: "markdown", path: "docs/a.md" });
  });

  it("round-trips whatever the minter produced", () => {
    const channel = pluginFileChannel(MARKDOWN_FILE_SCOPE, "/Users/x/notes/plan.md");
    expect(parsePluginFileChannel(channel)).toEqual({ scope: MARKDOWN_FILE_SCOPE, path: "/Users/x/notes/plan.md" });
  });

  // A colon is a legal character in a POSIX filename, so the path is taken verbatim from the
  // first marker on. Splitting on the LAST one would silently cut a real path in half.
  it("keeps a colon that belongs to the path", () => {
    expect(parsePluginFileChannel("plugin:markdown:file:docs/a:file:b.md")).toEqual({ scope: "markdown", path: "docs/a:file:b.md" });
  });

  // socket.io opens a room per socket id, and every other channel in the app is a room too.
  it("refuses a channel that is not one of ours", () => {
    ["file-write", "dir-config", "A1b2C3d4", "plugin:markdown:generation", ""].forEach((channel) => {
      expect(parsePluginFileChannel(channel)).toBeNull();
    });
  });

  it("refuses a channel that names no file", () => {
    expect(parsePluginFileChannel("plugin:markdown:file:")).toBeNull();
  });

  it("refuses a channel with no scope", () => {
    expect(parsePluginFileChannel("plugin::file:a.md")).toBeNull();
  });
});

describe("fileChannelPath", () => {
  // The publisher normalises to POSIX before it mints a channel. A Windows subscriber that
  // kept its own separators would name a channel nothing is ever published on — and nothing
  // would error, which is the whole reason this is a shared function.
  it("spells a Windows path the way the channel spells it", () => {
    expect(fileChannelPath("C:\\ws\\docs\\a.md")).toBe("C:/ws/docs/a.md");
  });

  it("leaves a POSIX path alone", () => {
    expect(fileChannelPath("/ws/docs/a.md")).toBe("/ws/docs/a.md");
  });

  it("normalises the mixed spelling a client-side join produces", () => {
    expect(fileChannelPath("C:\\ws/docs/a.md")).toBe("C:/ws/docs/a.md");
  });
});
