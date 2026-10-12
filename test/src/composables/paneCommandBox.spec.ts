import { describe, it, expect, vi } from "vitest";
import { createPaneCommandBox } from "../../../src/composables/paneCommandBox";
import type { PaneCheck, PaneShow } from "../../../common/paneCommand";

const show = (sessionId: string, path = "a.md"): PaneShow => ({ kind: "show", sessionId, cwd: "/w", path, view: "editor" });
const check = (sessionId: string, id: string): PaneCheck => ({ kind: "check", sessionId, cwd: "/w", id, title: "T", items: [{ label: "x" }] });

describe("createPaneCommandBox", () => {
  it("hands a waiting file over once, the latest one per session", () => {
    const box = createPaneCommandBox(async () => null);
    box.offer(show("s1", "a.md"));
    box.offer(show("s1", "b.md"));
    expect(box.takeShow("s1")?.path).toBe("b.md");
    expect(box.takeShow("s1")).toBeUndefined();
  });

  it("holds one check per session, a newer one replacing it", () => {
    const box = createPaneCommandBox(async () => null);
    box.offer(check("s1", "c1"));
    box.offer(check("s1", "c2"));
    expect(box.checks.value.get("s1")?.id).toBe("c2");
  });

  // A check is closed once: neither the server's late copy nor a replayed publish brings it back.
  it("does not bring back a closed check, from the server or the channel", async () => {
    const fetchCheck = vi.fn(async () => check("s1", "c1"));
    const box = createPaneCommandBox(fetchCheck);
    box.offer(check("s1", "c1"));
    expect(box.close("s1")).toBe("c1");
    await box.hydrate("s1");
    box.offer(check("s1", "c1"));
    expect(box.checks.value.has("s1")).toBe(false);
    box.offer(check("s1", "c2"));
    expect(box.checks.value.get("s1")?.id).toBe("c2");
    expect(box.close("nobody")).toBeNull();
  });

  it("reads back an open check the browser missed", async () => {
    const box = createPaneCommandBox(async (sessionId) => check(sessionId, "c9"));
    await box.hydrate("s2");
    expect(box.checks.value.get("s2")?.id).toBe("c9");
  });
});
