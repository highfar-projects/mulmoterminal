import { describe, it, expect, vi } from "vitest";
import { createQuestionBox } from "../../../src/composables/questionBox";
import type { AskQuestionEvent } from "../../../common/askQuestion";

// Which dialog each session is blocked on (#1679). Two sources feed it and they disagree about
// time: the live channel, and an HTTP ask used after a reload or reconnect. The tests that matter
// here are the ORDERINGS between them — a box that accepts a stale answer leaves live buttons over
// a terminal that has moved on, where an arrow walks the input history and Enter submits it.
const event = (sessionId: string, toolUseId: string): AskQuestionEvent => ({
  sessionId,
  toolUseId,
  questions: [{ question: "Red or blue?", header: "Color", options: [{ label: "Red" }, { label: "Blue" }], multiSelect: false }],
});

const deferred = () => {
  let resolve: (value: AskQuestionEvent | null) => void = () => {};
  const promise = new Promise<AskQuestionEvent | null>((r) => (resolve = r));
  return { promise, resolve };
};

describe("createQuestionBox", () => {
  it("holds a question per session and hands back the right one", () => {
    const box = createQuestionBox(async () => null);
    box.offer(event("s1", "t1"));
    box.offer(event("s2", "t2"));

    expect(box.get("s1")?.toolUseId).toBe("t1");
    expect(box.get("s2")?.toolUseId).toBe("t2");
    expect(box.get("s3")).toBeNull();
  });

  it("drops the question its close names, and says it did", () => {
    const box = createQuestionBox(async () => null);
    box.offer(event("s1", "t1"));

    expect(box.close({ sessionId: "s1", toolUseId: "t1", done: true })).toBe(true);
    expect(box.has("s1")).toBe(false);
  });

  // A close for a dialog the box never held (or for an older one) must not drop what it holds now.
  it("ignores a close that names another dialog", () => {
    const box = createQuestionBox(async () => null);
    box.offer(event("s1", "t2"));

    expect(box.close({ sessionId: "s1", toolUseId: "t1", done: true })).toBe(false);
    expect(box.get("s1")?.toolUseId).toBe("t2");
  });

  it("hydrates a session it holds nothing for", async () => {
    const box = createQuestionBox(async () => event("s1", "t1"));
    await box.hydrate("s1");
    expect(box.get("s1")?.toolUseId).toBe("t1");
  });

  it("does not ask when it already holds that session's question", async () => {
    const fetchOpen = vi.fn(async () => event("s1", "t9"));
    const box = createQuestionBox(fetchOpen);
    box.offer(event("s1", "t1"));

    await box.hydrate("s1");

    expect(fetchOpen).not.toHaveBeenCalled();
    expect(box.get("s1")?.toolUseId).toBe("t1");
  });

  // THE RACE this box exists for. A reconnect starts the ask while the dialog is still open; the
  // close lands before the answer does, and finds an empty box, so it has nothing to drop. The
  // answer must not then put the closed dialog back.
  it("refuses a hydration that a close overtook", async () => {
    const pending = deferred();
    const box = createQuestionBox(() => pending.promise);

    const hydrating = box.hydrate("s1");
    expect(box.close({ sessionId: "s1", toolUseId: "t1", done: true })).toBe(false); // nothing held yet
    pending.resolve(event("s1", "t1"));
    await hydrating;

    expect(box.has("s1")).toBe(false);
  });

  // Fail-closed applies to a close for a DIFFERENT dialog too: the box cannot tell from here
  // whether the answer predates it, and the next enlarge asks again.
  it("refuses a hydration overtaken by any close of that session", async () => {
    const pending = deferred();
    const box = createQuestionBox(() => pending.promise);

    const hydrating = box.hydrate("s1");
    box.close({ sessionId: "s1", toolUseId: "older", done: true });
    pending.resolve(event("s1", "t2"));
    await hydrating;

    expect(box.has("s1")).toBe(false);
  });

  it("leaves other sessions' hydrations alone", async () => {
    const pending = deferred();
    const box = createQuestionBox(() => pending.promise);

    const hydrating = box.hydrate("s1");
    box.close({ sessionId: "s2", toolUseId: "t1", done: true });
    pending.resolve(event("s1", "t1"));
    await hydrating;

    expect(box.get("s1")?.toolUseId).toBe("t1");
  });

  // The live channel is the fresher source when both arrive: it carries the dialog that is up now.
  it("keeps a live question that arrived while the ask was in flight", async () => {
    const pending = deferred();
    const box = createQuestionBox(() => pending.promise);

    const hydrating = box.hydrate("s1");
    box.offer(event("s1", "live"));
    pending.resolve(event("s1", "stale"));
    await hydrating;

    expect(box.get("s1")?.toolUseId).toBe("live");
  });

  it("holds nothing when the ask finds no open dialog", async () => {
    const box = createQuestionBox(async () => null);
    await box.hydrate("s1");
    expect(box.has("s1")).toBe(false);
  });
});
