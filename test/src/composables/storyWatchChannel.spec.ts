import { describe, it, expect } from "vitest";
import { TOOL_NAME as STORY_TOOL } from "@mulmoclaude/mulmoscript-plugin";
import { storyWatchChannel } from "../../../src/composables/storyWatchChannel";

// #3014. The channel the Files pane holds open while it shows a story. The path must be the card's
// own `filePath`, verbatim: the server announces on it and the View compares the two as strings.
describe("storyWatchChannel", () => {
  it("names the story's file under the mulmoScript scope, verbatim", () => {
    expect(storyWatchChannel({ toolName: STORY_TOOL, data: { script: {}, filePath: "stories/deck.json" } })).toBe("plugin:mulmoScript:file:stories/deck.json");
    expect(storyWatchChannel({ toolName: STORY_TOOL, data: { filePath: "/repo/talks/deck.json" } })).toBe("plugin:mulmoScript:file:/repo/talks/deck.json");
    expect(storyWatchChannel({ toolName: STORY_TOOL, data: { filePath: "C:\\repo\\deck.json" } })).toBe("plugin:mulmoScript:file:C:\\repo\\deck.json");
  });

  it("names nothing for a card that is not a story", () => {
    expect(storyWatchChannel(null)).toBeNull();
    expect(storyWatchChannel({ toolName: "presentDocument", data: { filePath: "notes.md" } })).toBeNull();
  });

  it("names nothing for a story with no usable filePath", () => {
    expect(storyWatchChannel({ toolName: STORY_TOOL, data: {} })).toBeNull();
    expect(storyWatchChannel({ toolName: STORY_TOOL, data: { filePath: "" } })).toBeNull();
    expect(storyWatchChannel({ toolName: STORY_TOOL, data: { filePath: 42 } })).toBeNull();
  });

  // The server announces with no root, and the View matches the root as well as the path.
  it("leaves out a story card that names a root, but not one whose root is blank", () => {
    expect(storyWatchChannel({ toolName: STORY_TOOL, data: { filePath: "stories/deck.json", root: "talks" } })).toBeNull();
    expect(storyWatchChannel({ toolName: STORY_TOOL, data: { filePath: "stories/deck.json", root: " " } })).toBe("plugin:mulmoScript:file:stories/deck.json");
  });
});
