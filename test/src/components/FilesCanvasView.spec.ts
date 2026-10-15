import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import { TOOL_NAME as STORY_TOOL } from "@mulmoclaude/mulmoscript-plugin";
import type { FilesCanvasResult } from "../../../src/composables/useFilesCanvasMode";

// What the view holds open, and when it lets go — the server watches a story only while this
// subscription exists (#3014).
const pubsub = vi.hoisted(() => ({ subscribed: [] as string[], released: [] as string[] }));
vi.mock("../../../src/composables/usePubSub", () => ({
  usePubSub: () => ({
    subscribe: (channel: string) => {
      pubsub.subscribed.push(channel);
      return () => pubsub.released.push(channel);
    },
    onReconnect: () => () => {},
  }),
}));
// The plugin views are not what is under test here, and drawing one needs the whole runtime.
vi.mock("../../../src/plugins-registry", () => ({ getPlugin: () => undefined }));

const FilesCanvasView = (await import("../../../src/components/FilesCanvasView.vue")).default;

const story = (filePath: string): FilesCanvasResult => ({ toolName: STORY_TOOL, data: { script: {}, filePath }, uuid: filePath });
const STORY_CHANNEL = (filePath: string) => `plugin:mulmoScript:file:${filePath}`;

describe("FilesCanvasView — watching the story it shows (#3014)", () => {
  beforeEach(() => {
    pubsub.subscribed.length = 0;
    pubsub.released.length = 0;
  });

  it("holds the story's file channel open while the card is shown", () => {
    mount(FilesCanvasView, { props: { card: story("stories/deck.json") } });
    expect(pubsub.subscribed).toEqual([STORY_CHANNEL("stories/deck.json")]);
    expect(pubsub.released).toEqual([]);
  });

  it("moves to the next story and lets go of the last one", async () => {
    const wrapper = mount(FilesCanvasView, { props: { card: story("stories/a.json") } });
    await wrapper.setProps({ card: story("/repo/b.json") });
    expect(pubsub.subscribed).toEqual([STORY_CHANNEL("stories/a.json"), STORY_CHANNEL("/repo/b.json")]);
    expect(pubsub.released).toEqual([STORY_CHANNEL("stories/a.json")]);
  });

  it("lets go when the card goes away, and when the view unmounts", async () => {
    const wrapper = mount(FilesCanvasView, { props: { card: story("stories/a.json") } });
    await wrapper.setProps({ card: null });
    expect(pubsub.released).toEqual([STORY_CHANNEL("stories/a.json")]);

    await wrapper.setProps({ card: story("stories/b.json") });
    wrapper.unmount();
    expect(pubsub.released).toEqual([STORY_CHANNEL("stories/a.json"), STORY_CHANNEL("stories/b.json")]);
  });

  it("subscribes to nothing for a card that is not a story", () => {
    mount(FilesCanvasView, { props: { card: { toolName: "presentDocument", data: { markdown: "", docPath: "notes.md" }, uuid: "n" } } });
    mount(FilesCanvasView, { props: { card: null } });
    expect(pubsub.subscribed).toEqual([]);
  });
});
