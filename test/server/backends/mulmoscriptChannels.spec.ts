// @vitest-environment node
import { describe, it, expect } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { GENERATION_EVENT, SCRIPT_CHANGED_EVENT } from "@mulmoclaude/mulmoscript-plugin/server";
import { initMulmoScriptBackend, publishMulmoScriptChangedForTest } from "../../../server/backends/mulmoscript.js";

/**
 * The channel names the View listens on.
 *
 * The client builds `plugin:<scope>:<event>` itself (src/composables/pluginRuntime.ts), so the
 * server and the client agree only by both deriving the event name from the package. Hard-coding
 * either half is how a rename silently stops every View listening — the publish still succeeds,
 * and nothing is subscribed.
 *
 * `scriptChanged` is what carries an agent's edit into an already-open canvas; without it the
 * preview shows the old file until the user reopens it.
 */

const channel = (event: string) => `plugin:mulmoScript:${event}`;

describe("mulmoScript pubsub channels", () => {
  it("derives both channels from the package rather than a literal", () => {
    expect(channel(GENERATION_EVENT)).toBe("plugin:mulmoScript:generation");
    expect(channel(SCRIPT_CHANGED_EVENT)).toBe("plugin:mulmoScript:scriptChanged");
  });

  it("keeps them distinct — one carries progress, the other carries a write", () => {
    expect(GENERATION_EVENT).not.toBe(SCRIPT_CHANGED_EVENT);
  });
});

describe("the backend actually publishes a script change", () => {
  it("puts the event on the scriptChanged channel", () => {
    // Without this test the wiring can be deleted and every other test stays green — the
    // publish has no other observable, and the feature is the publish.
    const published: { channel: string; data: unknown }[] = [];
    initMulmoScriptBackend({
      workspace: mkdtempSync(join(tmpdir(), "mulmoscript-channels-")),
      pubsub: { publish: (channel, data) => published.push({ channel, data }) },
      isFfmpegAvailable: () => false,
    });

    publishMulmoScriptChangedForTest("stories/deck.json", "deck-editor-x");

    expect(published).toEqual([{ channel: "plugin:mulmoScript:scriptChanged", data: { filePath: "stories/deck.json", origin: "deck-editor-x" } }]);
  });
});
