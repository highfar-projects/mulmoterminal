// @vitest-environment node
import { describe, it, expect } from "vitest";
import path from "node:path";
import { isEchoOfOwnWrite, isScriptPath, scriptFileOnDisk, type ScriptDirs } from "../../../../server/backends/plugins/mulmoscriptWatchRules";

const STORIES = path.resolve("/ws/artifacts/stories");
const REPO = path.resolve("/repos/talks");
const DIRS: ScriptDirs = { storiesDir: STORIES, rootDirs: new Map([["talks", REPO]]) };

// #3014. The file a watched channel or a plugin write names, resolved the way the plugin resolves
// it: a wrong answer either watches the wrong file or fails to recognise the plugin's own write.
describe("scriptFileOnDisk", () => {
  it("takes an absolute path as itself", () => {
    const abs = path.resolve("/repos/talks/deck.json");
    expect(scriptFileOnDisk(abs, undefined, DIRS)).toBe(abs);
  });

  it("puts stories/<tail> under the default stories directory", () => {
    expect(scriptFileOnDisk("stories/deck.json", undefined, DIRS)).toBe(path.join(STORIES, "deck.json"));
    expect(scriptFileOnDisk("stories/sub/deck.json", undefined, DIRS)).toBe(path.join(STORIES, "sub", "deck.json"));
  });

  // The plugin strips `stories/` before the named root's FileOps sees the rest.
  it("puts stories/<tail> under a named root, trimming the root as the plugin does", () => {
    expect(scriptFileOnDisk("stories/deck.json", "talks", DIRS)).toBe(path.join(REPO, "deck.json"));
    expect(scriptFileOnDisk("stories/deck.json", " talks ", DIRS)).toBe(path.join(REPO, "deck.json"));
  });

  it("treats an empty or blank root as the default", () => {
    expect(scriptFileOnDisk("stories/deck.json", "", DIRS)).toBe(path.join(STORIES, "deck.json"));
    expect(scriptFileOnDisk("stories/deck.json", "  ", DIRS)).toBe(path.join(STORIES, "deck.json"));
  });

  it("names nothing for a root it was not given", () => {
    expect(scriptFileOnDisk("stories/deck.json", "elsewhere", DIRS)).toBeNull();
  });

  it("names nothing for a relative path outside stories/, or for stories/ alone", () => {
    expect(scriptFileOnDisk("deck.json", undefined, DIRS)).toBeNull();
    expect(scriptFileOnDisk("artifacts/stories/deck.json", undefined, DIRS)).toBeNull();
    expect(scriptFileOnDisk("stories/", undefined, DIRS)).toBeNull();
    expect(scriptFileOnDisk("", undefined, DIRS)).toBeNull();
  });
});

describe("isScriptPath", () => {
  it("accepts a .json in any case and nothing else", () => {
    expect(isScriptPath("stories/deck.json")).toBe(true);
    expect(isScriptPath("/a/DECK.JSON")).toBe(true);
    expect(isScriptPath("/a/deck.md")).toBe(false);
    expect(isScriptPath("/a/deck.json.bak")).toBe(false);
    expect(isScriptPath("")).toBe(false);
  });
});

describe("isEchoOfOwnWrite", () => {
  it("is the plugin's own write when the file still looks as it did after that write", () => {
    expect(isEchoOfOwnWrite("1:10:7", "1:10:7")).toBe(true);
  });

  it("is someone else's write when the file has moved on, or when nothing was recorded", () => {
    expect(isEchoOfOwnWrite("2:11:7", "1:10:7")).toBe(false);
    expect(isEchoOfOwnWrite("1:10:7", undefined)).toBe(false);
  });

  // A deleted file is news to the View even if the plugin's last write also found nothing there.
  it("never calls a missing file an echo", () => {
    expect(isEchoOfOwnWrite(null, null)).toBe(false);
    expect(isEchoOfOwnWrite(null, "1:10:7")).toBe(false);
  });
});
