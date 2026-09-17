import { describe, it, expect, vi, afterEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import RateLimitGauge from "../../../src/components/RateLimitGauge.vue";
import { reloadAccounts } from "../../../src/composables/useAccounts";

// The note only reaches a user through the template, and the pure function that produces it can be
// green while nothing renders it. #1011's whole point is that an absent Claude gauge must say why,
// so the wiring is what needs pinning here.

const body = (over: Record<string, unknown>) => ({ claude: null, codex: null, probing: false, ...over });

// `useAccounts` is a module-level singleton shared across every test in this file — once it has
// fetched, a later test's differently-shaped mock is never consulted unless the cache is forced
// to reload. Every test here gets an empty account list by default (`accounts: []`), same as a
// GET /api/accounts response nobody has configured accounts on.
const serve = (payload: Record<string, unknown>, accounts: { id: string; label: string }[] = []) => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: unknown) => {
      if (typeof url === "string" && url.includes("/api/accounts")) return { ok: true, json: async () => ({ accounts }) };
      return { ok: true, json: async () => payload };
    }),
  );
};

const showGauge = async (payload: Record<string, unknown>, accounts: { id: string; label: string }[] = []) => {
  serve(payload, accounts);
  await reloadAccounts();
  const wrapper = mount(RateLimitGauge);
  await flushPromises();
  return wrapper;
};

const note = (wrapper: Awaited<ReturnType<typeof showGauge>>) => wrapper.find('[data-testid="rate-limit-note"]');

// Relative to now, not a fixed epoch: a hard-coded timestamp silently becomes a PAST reset as the
// clock moves on, and a window whose reset has gone by is deliberately not rendered any more.
const inHours = (h: number) => Math.floor(Date.now() / 1000) + h * 3600;
const limits = { fiveHour: { usedPercentage: 12, resetsAt_sec: inHours(2) }, sevenDay: null };

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("RateLimitGauge", () => {
  it("says why the Claude half is missing, with the reason on hover", async () => {
    const wrapper = await showGauge(body({ claudeProbe: "no-claude" }));
    expect(note(wrapper).text()).toBe("claude usage n/a");
    expect(note(wrapper).attributes("title")).toContain("not found on PATH");
    wrapper.unmount();
  });

  it("names the API-key case and the retrying case differently", async () => {
    const noWindows = await showGauge(body({ claudeProbe: "no-windows" }));
    expect(noWindows.get('[data-testid="rate-limit-note"]').attributes("title")).toContain("API-key billing");
    noWindows.unmount();

    const noReport = await showGauge(body({ claudeProbe: "no-report" }));
    expect(noReport.get('[data-testid="rate-limit-note"]').attributes("title")).toContain("Retrying");
    noReport.unmount();
  });

  it("stays silent when nothing has been measured yet, rather than inventing a fault", async () => {
    const wrapper = await showGauge(body({ claudeProbe: "ok" }));
    expect(note(wrapper).exists()).toBe(false);
    wrapper.unmount();
  });

  it("drops the note once the figures arrive", async () => {
    const wrapper = await showGauge(body({ claude: limits, claudeProbe: "ok" }));
    expect(note(wrapper).exists()).toBe(false);
    expect(wrapper.text()).toContain("5h");
    wrapper.unmount();
  });

  // The gap the note was written for and did not cover: a cached reading outlives its window, so
  // uninstalling `claude` used to leave yesterday's percentage on screen saying nothing.
  it("replaces a figure whose window has already reset with the reason", async () => {
    const stale = { fiveHour: { usedPercentage: 83, resetsAt_sec: inHours(-1) }, sevenDay: null };
    const wrapper = await showGauge(body({ claude: stale, claudeProbe: "no-claude" }));

    expect(wrapper.text()).not.toContain("83");
    expect(note(wrapper).attributes("title")).toContain("not found on PATH");
    wrapper.unmount();
  });

  // Codex review on #1047: hiding the row is only half of it. The row carries an aria-label, and a
  // screen reader announcing a percentage that is not on screen is worse than one announcing none.
  it("does not announce a percentage it has stopped showing", async () => {
    const half = { fiveHour: { usedPercentage: 83, resetsAt_sec: inHours(-1) }, sevenDay: { usedPercentage: 40, resetsAt_sec: inHours(9) } };
    const wrapper = await showGauge(body({ claude: half, claudeProbe: "ok" }));

    const spoken = wrapper.findAll("[aria-label]").map((el) => el.attributes("aria-label") ?? "");
    expect(spoken.join(" ")).toContain("7d 40% used");
    expect(spoken.join(" ")).not.toContain("83");
    expect(wrapper.text()).not.toContain("83");
    wrapper.unmount();
  });

  // #1161, as reported: `claude usage n/a | 7d 71%`. The 71% is Codex's — the note only appears
  // when Claude has nothing — but nothing on the row said so, and it was read as Claude's 7d with
  // the 5h missing. Whether a figure belongs to the tool beside it is not something a reader can
  // work out, so this pins the MARK reaching the screen and not merely the flag.
  it("says whose the surviving figure is when a note stands in for the other", async () => {
    const codex = { fiveHour: null, sevenDay: { usedPercentage: 71, resetsAt_sec: inHours(50) } };
    const wrapper = await showGauge(body({ codex, claudeProbe: "no-report" }));

    expect(note(wrapper).exists()).toBe(true);
    expect(wrapper.text()).toContain("7d 71%");
    expect(wrapper.get("[aria-label]").attributes("aria-label")).toContain("codex rate limit");
    expect(wrapper.findComponent({ name: "AgentMark" }).props("agent")).toBe("codex");
    wrapper.unmount();
  });

  // #579's accounts feature: below two configured accounts every test above this one is the
  // regression pin — the server never sends claudeAccounts in that case, so none of it changes.
  describe("with a per-account breakdown", () => {
    const accounts = [
      { id: "work", label: "Work" },
      { id: "personal", label: "Personal" },
    ];

    it("renders one labelled row per account instead of a single claude row", async () => {
      const wrapper = await showGauge(
        {
          codex: null,
          probing: false,
          claudeAccounts: {
            work: { limits, probe: "ok" },
            personal: { limits: null, probe: "no-report" },
          },
        },
        accounts,
      );
      const rows = wrapper.findAll('[data-testid="rate-limit-account"]');
      expect(rows).toHaveLength(2);
      expect(rows[0]?.text()).toContain("Work");
      expect(rows[0]?.text()).toContain("5h 12%");
      expect(rows[1]?.text()).toContain("Personal");
      expect(rows[1]?.text()).toContain("n/a");
      wrapper.unmount();
    });

    it("does not also render the plain claude row once a breakdown is present", async () => {
      const wrapper = await showGauge({ codex: null, probing: false, claudeAccounts: { work: { limits, probe: "ok" } } }, accounts);
      expect(wrapper.find('[data-testid="rate-limit-note"]').exists()).toBe(false);
      expect(wrapper.findAll('[data-testid="rate-limit-account"]')).toHaveLength(1);
      wrapper.unmount();
    });
  });
});
