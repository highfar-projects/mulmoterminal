// The seam that carries "your issue is not being updated" from the server to the cell (#1369).
//
// Worth its own file because a mistake here is invisible everywhere else: the poll swallowed this
// response entirely before, and if the field name drifted, `postWorkComment` would go back to
// swallowing it while every other spec still passed.
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { ref } from "vue";
import { useWorkItem } from "../../../src/composables/useWorkItem";
import { setIssueWorkComments } from "../../../src/composables/issueWorkComments";

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
  setIssueWorkComments(false);
  vi.restoreAllMocks();
});
beforeEach(() => setIssueWorkComments(true));

const PHASE = { phase: "none", pr: null, issue: 1234, issueUrl: "https://github.com/o/r/issues/1234" };

// The phase poll answers the same thing every time; only what /api/work-comment says varies.
const stubFetch = (workComment: unknown, ok = true) => {
  globalThis.fetch = vi.fn((url: unknown) => {
    const body = String(url).includes("/api/work-comment") ? workComment : PHASE;
    return Promise.resolve({ ok, json: async () => body });
  }) as unknown as typeof fetch;
};

const settle = () => vi.waitFor(() => expect(globalThis.fetch).toHaveBeenCalledTimes(2));

describe("useWorkItem reports why the issue was not updated", () => {
  it("holds the cause the server named", async () => {
    stubFetch({ posted: false, reason: "gh-failed", failure: "permission" });
    const { commentFailure, refresh } = useWorkItem(ref("/dir"));
    await refresh();
    await settle();
    await vi.waitFor(() => expect(commentFailure.value).toBe("permission"));
  });

  it("holds nothing when the comment landed", async () => {
    stubFetch({ posted: true, closed: false });
    const { commentFailure, refresh } = useWorkItem(ref("/dir"));
    await refresh();
    await settle();
    expect(commentFailure.value).toBeNull();
  });

  // The notice has to come back DOWN once the login is fixed, without waiting for a reload — so
  // the next milestone assigns the result rather than only recording a failure.
  it("drops the cause once a later milestone succeeds", async () => {
    let phase: unknown = PHASE;
    let answer: unknown = { posted: false, reason: "gh-failed", failure: "auth" };
    globalThis.fetch = vi.fn((url: unknown) =>
      Promise.resolve({ ok: true, json: async () => (String(url).includes("/api/work-comment") ? answer : phase) }),
    ) as unknown as typeof fetch;

    const { commentFailure, refresh } = useWorkItem(ref("/dir"));
    await refresh();
    await vi.waitFor(() => expect(commentFailure.value).toBe("auth"));

    // A PR appearing is the next milestone this cell watches happen, so it asks again.
    phase = { ...PHASE, pr: 1240 };
    answer = { posted: true, closed: false };
    await refresh();
    await vi.waitFor(() => expect(commentFailure.value).toBeNull());
  });

  // "Nothing to add" and "the setting is off" are not failures, and a notice for either would be
  // reporting a problem that does not exist.
  it("holds nothing when there was simply nothing to say", async () => {
    stubFetch({ posted: false, reason: "already" });
    const { commentFailure, refresh } = useWorkItem(ref("/dir"));
    await refresh();
    await settle();
    expect(commentFailure.value).toBeNull();
  });

  // A cause this build has never heard of comes from a server that is not this one, or is newer
  // than this one — either way the wording switch has no entry for it.
  it("ignores a cause it cannot word", async () => {
    stubFetch({ posted: false, reason: "gh-failed", failure: "teapot" });
    const { commentFailure, refresh } = useWorkItem(ref("/dir"));
    await refresh();
    await settle();
    expect(commentFailure.value).toBeNull();
  });

  it("says nothing at all while the setting is off", async () => {
    setIssueWorkComments(false);
    stubFetch({ posted: false, reason: "gh-failed", failure: "permission" });
    const { commentFailure, refresh } = useWorkItem(ref("/dir"));
    await refresh();
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    expect(commentFailure.value).toBeNull();
  });
});
