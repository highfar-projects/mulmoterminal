// @vitest-environment node
import { describe, it, expect } from "vitest";
import { collectionNotifiedSeverities, type NotifiedEntryLike } from "../../../src/utils/collectionNotified";
import { buildPluginData } from "../../../server/backends/collectionNotifierAdapter.js";

// A bell as the UI sees it: `pluginData` is whatever the publishing app wrote (it
// reaches the browser as `unknown`), `severity` is the notifier's own.
const entry = (slug: string, itemId: string | undefined, severity: string): NotifiedEntryLike => ({
  severity,
  pluginData: { action: { type: "navigate", target: { view: "collections", slug, ...(itemId ? { itemId } : {}) } } },
});

describe("collectionNotifiedSeverities", () => {
  it("keys by itemId, for the requested slug only", () => {
    const map = collectionNotifiedSeverities([entry("tasks", "t1", "nudge"), entry("other", "o1", "urgent")], "tasks");
    expect([...map]).toEqual([["t1", "nudge"]]);
  });

  // A collection-level bell has no record to accent — including it would key the
  // map on `undefined` and light up nothing (or the wrong card).
  it("skips an entry with no itemId", () => {
    expect(collectionNotifiedSeverities([entry("tasks", undefined, "urgent")], "tasks").size).toBe(0);
  });

  it("keeps the worst severity when a record has several bells", () => {
    const map = collectionNotifiedSeverities([entry("tasks", "t1", "nudge"), entry("tasks", "t1", "urgent"), entry("tasks", "t1", "info")], "tasks");
    expect(map.get("t1")).toBe("urgent");
  });

  it("does not let a later, milder bell downgrade the accent", () => {
    const map = collectionNotifiedSeverities([entry("tasks", "t1", "urgent"), entry("tasks", "t1", "info")], "tasks");
    expect(map.get("t1")).toBe("urgent");
  });

  it("treats an unknown severity as info rather than dropping the record", () => {
    expect(collectionNotifiedSeverities([entry("tasks", "t1", "catastrophic")], "tasks").get("t1")).toBe("info");
  });

  it("ignores entries whose pluginData is missing, malformed, or targets another view", () => {
    const junk: NotifiedEntryLike[] = [
      { severity: "urgent" },
      { severity: "urgent", pluginData: null },
      { severity: "urgent", pluginData: "nope" },
      { severity: "urgent", pluginData: { action: "navigate" } },
      { severity: "urgent", pluginData: { action: { target: { view: "files", slug: "tasks", itemId: "t1" } } } },
      { severity: "urgent", pluginData: { action: { target: { view: "collections", slug: 7, itemId: "t1" } } } },
    ];
    expect(collectionNotifiedSeverities(junk, "tasks").size).toBe(0);
  });

  // The point of the whole path: what OUR publisher writes must be what this reads.
  // Both sides go through common/collectionNotifyTarget, and this is the test that
  // fails if either end stops using it.
  it("reads back a bell built by this app's own publisher", () => {
    const published: NotifiedEntryLike = {
      severity: "urgent",
      pluginData: buildPluginData({ legacyId: "todo:tasks/t1", slug: "tasks", itemId: "t1", priority: "high" }),
    };
    expect(collectionNotifiedSeverities([published], "tasks").get("t1")).toBe("urgent");
  });
});
