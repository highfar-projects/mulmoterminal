// The composable behind the surviving-sessions section. Its own file because the thing worth
// pinning here is a WINDOW — what is reported between asking the server and being answered — which
// a mounted component cannot express: the section does not expose `reload`, and the note it renders
// is one frame of the answer rather than the answer itself (#2184, Codex round 1).
import { describe, it, expect, vi } from "vitest";
import { useSurvivingSessions } from "../../../src/composables/useSurvivingSessions";

// A first read that answers, then a second that stays in flight until the test releases it.
const deferredSecondRead = (firstArmedHours: number) => {
  let release: ((value: unknown) => void) | null = null;
  let calls = 0;
  globalThis.fetch = vi.fn(() => {
    calls += 1;
    if (calls === 1) return Promise.resolve({ ok: true, json: async () => ({ sessions: [], armedReapIntervalHours: firstArmedHours }) });
    return new Promise((resolve) => {
      release = resolve as (value: unknown) => void;
    });
  }) as unknown as typeof fetch;
  return {
    answerSecond: (armedHours: number) => release?.({ ok: true, json: async () => ({ sessions: [], armedReapIntervalHours: armedHours }) }),
  };
};

describe("useSurvivingSessions — the armed cadence", () => {
  it("reports what the server confirmed", async () => {
    globalThis.fetch = vi.fn(async () => ({ ok: true, json: async () => ({ sessions: [], armedReapIntervalHours: 6 }) })) as unknown as typeof fetch;
    const { armedReapIntervalHours, reload } = useSurvivingSessions();
    await reload();
    expect(armedReapIntervalHours.value).toBe(6);
  });

  // The window this exists for: between asking and being answered the value is last-known rather
  // than known, and a reload that goes on to fail holds it for the whole fetch timeout.
  it("stops reporting a cadence while a later read is still unanswered", async () => {
    const { answerSecond } = deferredSecondRead(6);
    const { armedReapIntervalHours, reload } = useSurvivingSessions();
    await reload();
    expect(armedReapIntervalHours.value).toBe(6);

    const second = reload();
    await Promise.resolve();
    expect(armedReapIntervalHours.value).toBeNull();

    answerSecond(2);
    await second;
    expect(armedReapIntervalHours.value).toBe(2);
  });

  it("stops reporting a cadence when the read fails", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    globalThis.fetch = vi.fn(async () => ({ ok: true, json: async () => ({ sessions: [], armedReapIntervalHours: 6 }) })) as unknown as typeof fetch;
    const { armedReapIntervalHours, reload } = useSurvivingSessions();
    await reload();

    globalThis.fetch = vi.fn(async () => {
      throw new Error("network down");
    }) as unknown as typeof fetch;
    await reload();
    expect(armedReapIntervalHours.value).toBeNull();
  });
});
