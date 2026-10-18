// The Working directory field's suggestions and its "this folder is not there" refusal: asked
// for only once typing has paused, accepted from the keyboard, and never shown for text the
// user has already typed past.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import type { AgentPick } from "../../../common/customAgents";
import { DIR_SUGGEST_ROUTE, type DirSuggestResponse } from "../../../common/dirSuggest";
import { DIR_SUGGEST_IDLE_MS } from "../../../src/composables/useDirSuggest";

const CellLaunchForm = (await import("../../../src/components/CellLaunchForm.vue")).default;

type SuggestAnswer = (typed: string) => Promise<DirSuggestResponse | "fail">;

const TREE: Record<string, string[]> = { "/srv/": ["alpha", "alps", "other"], "/srv/alpha/": ["src"] };
const EXISTING = new Set(["/srv", "/srv/", "/srv/alpha", "/srv/alpha/", "/repo"]);

// A shell's view of TREE: the parent of the text, its children starting with the last segment.
const fromTree: SuggestAnswer = async (typed) => {
  const cut = typed.lastIndexOf("/") + 1;
  const names = (TREE[typed.slice(0, cut)] ?? []).filter((name) => name.startsWith(typed.slice(cut)) && name !== typed.slice(cut));
  return { exists: EXISTING.has(typed), suggestions: names.map((name) => typed.slice(0, cut) + name) };
};

let suggestAnswer: SuggestAnswer;
const askedFor: string[] = [];

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  suggestAnswer = fromTree;
  askedFor.length = 0;
  globalThis.fetch = vi.fn(async (url: string) => {
    const u = new URL(String(url), "http://localhost");
    if (u.pathname === DIR_SUGGEST_ROUTE) {
      const typed = u.searchParams.get("path") ?? "";
      askedFor.push(typed);
      const answer = await suggestAnswer(typed);
      if (answer === "fail") throw new Error("offline");
      return { ok: true, json: async () => answer };
    }
    return { ok: true, json: async () => ({}) };
  }) as unknown as typeof fetch;
});

afterEach(() => {
  vi.useRealTimers();
});

const mountForm = async (dir = "/repo", agent: AgentPick = "claude") => {
  const w = mount(CellLaunchForm, {
    props: { dir, agent, choice: null, defaultCwd: "/home/me/ws", presets: [], openSessionIds: [] },
    global: { stubs: { ModelPicker: true } },
    attachTo: document.body,
  });
  await flushPromises();
  await w.get('[data-testid="cell-dir-input"]').trigger("focus");
  return w;
};

// The cell owns the field's value, so typing is the prop coming back down.
const typeInto = async (w: Awaited<ReturnType<typeof mountForm>>, dir: string) => {
  await w.setProps({ dir });
  await flushPromises();
};

const idle = async (ms = DIR_SUGGEST_IDLE_MS) => {
  await vi.advanceTimersByTimeAsync(ms);
  await flushPromises();
};

const rows = (w: Awaited<ReturnType<typeof mountForm>>) => w.findAll('[data-testid="cell-dir-suggestion"]').map((row) => row.text());
const input = (w: Awaited<ReturnType<typeof mountForm>>) => w.get('[data-testid="cell-dir-input"]');

describe("the Working directory suggestions", () => {
  it("asks only once typing has paused for the idle time", async () => {
    const w = await mountForm();
    await typeInto(w, "/srv/al");
    await idle(DIR_SUGGEST_IDLE_MS - 1);
    expect(askedFor).toEqual([]);
    expect(rows(w)).toEqual([]);
    await idle(1);
    expect(askedFor).toEqual(["/srv/al"]);
    expect(rows(w)).toEqual(["alpha/", "alps/"]);
  });

  it("restarts the wait on every keystroke", async () => {
    const w = await mountForm();
    await typeInto(w, "/srv/a");
    await idle(DIR_SUGGEST_IDLE_MS - 1);
    await typeInto(w, "/srv/al");
    await idle(DIR_SUGGEST_IDLE_MS - 1);
    expect(askedFor).toEqual([]);
    await idle(1);
    expect(askedFor).toEqual(["/srv/al"]);
  });

  it("takes the first row on Tab and asks for the next level at once", async () => {
    const w = await mountForm();
    await typeInto(w, "/srv/al");
    await idle();
    await input(w).trigger("keydown.tab");
    expect(w.emitted("update:dir")?.at(-1)).toEqual(["/srv/alpha/"]);
    await typeInto(w, "/srv/alpha/");
    expect(askedFor).toEqual(["/srv/al", "/srv/alpha/"]);
    expect(rows(w)).toEqual(["src/"]);
  });

  it("moves with the arrows and accepts the highlighted row on Enter without launching", async () => {
    const w = await mountForm();
    await typeInto(w, "/srv/al");
    await idle();
    await input(w).trigger("keydown.down");
    await input(w).trigger("keydown.down");
    expect(w.findAll('[data-testid="cell-dir-suggestion"]')[1].attributes("aria-selected")).toBe("true");
    await input(w).trigger("keydown.enter");
    await flushPromises();
    expect(w.emitted("update:dir")?.at(-1)).toEqual(["/srv/alps/"]);
    expect(w.emitted("start")).toBeUndefined();
  });

  it("accepts a clicked row", async () => {
    const w = await mountForm();
    await typeInto(w, "/srv/al");
    await idle();
    await w.findAll('[data-testid="cell-dir-suggestion"]')[1].trigger("mousedown");
    expect(w.emitted("update:dir")?.at(-1)).toEqual(["/srv/alps/"]);
  });

  it("closes on Escape, and a plain Enter then launches", async () => {
    const w = await mountForm();
    await typeInto(w, "/srv/");
    await idle();
    expect(rows(w)).toEqual(["alpha/", "alps/", "other/"]);
    await input(w).trigger("keydown.esc");
    expect(rows(w)).toEqual([]);
    await input(w).trigger("keydown.enter");
    await flushPromises();
    expect(w.emitted("start")).toEqual([["/srv/"]]);
  });

  it("shows no list while the field is not focused", async () => {
    const w = await mountForm();
    await input(w).trigger("blur");
    await typeInto(w, "/srv/al");
    await idle();
    expect(rows(w)).toEqual([]);
  });

  it("drops an answer for text the user has since typed past", async () => {
    let release: (answer: DirSuggestResponse) => void = () => {};
    suggestAnswer = (typed) => (typed === "/gone" ? new Promise((resolve) => (release = resolve)) : fromTree(typed));
    const w = await mountForm();
    await typeInto(w, "/gone");
    await idle();
    await typeInto(w, "/srv/");
    release({ exists: false, suggestions: ["/gone-stale"] });
    await flushPromises();
    expect(w.find('[data-testid="cell-dir-missing"]').exists()).toBe(false);
    expect(rows(w)).toEqual([]);
  });
});

describe("a Working directory that does not exist", () => {
  it("says so and disables the play button once typing pauses", async () => {
    const w = await mountForm();
    await typeInto(w, "/srv/nope");
    expect(w.find('[data-testid="cell-dir-missing"]').exists()).toBe(false);
    await idle();
    expect(w.find('[data-testid="cell-dir-missing"]').text()).toContain("does not exist");
    expect(w.get('[data-testid="cell-dir-go"]').attributes("disabled")).toBeDefined();
    await input(w).trigger("keydown.enter");
    await flushPromises();
    expect(w.emitted("start")).toBeUndefined();
  });

  it("is refused on an Enter pressed before the idle time is up", async () => {
    const w = await mountForm();
    await typeInto(w, "/srv/nope");
    await input(w).trigger("keydown.enter");
    await flushPromises();
    expect(w.emitted("start")).toBeUndefined();
    expect(w.find('[data-testid="cell-dir-missing"]').exists()).toBe(true);
  });

  it("clears the notice as soon as the text changes", async () => {
    const w = await mountForm();
    await typeInto(w, "/srv/nope");
    await idle();
    await typeInto(w, "/srv/alpha");
    expect(w.find('[data-testid="cell-dir-missing"]').exists()).toBe(false);
    expect(w.get('[data-testid="cell-dir-go"]').attributes("disabled")).toBeUndefined();
  });

  it("launches an existing one on an early Enter", async () => {
    const w = await mountForm();
    await typeInto(w, "/srv/alpha");
    await input(w).trigger("keydown.enter");
    await flushPromises();
    expect(w.emitted("start")).toEqual([["/srv/alpha"]]);
  });

  // The server refuses a missing directory on its own, so "could not tell" must not add a failure.
  it("does not block a launch when the check cannot answer", async () => {
    suggestAnswer = async () => "fail";
    const w = await mountForm();
    await typeInto(w, "/srv/nope");
    await idle();
    expect(w.find('[data-testid="cell-dir-missing"]').exists()).toBe(false);
    await input(w).trigger("keydown.enter");
    await flushPromises();
    expect(w.emitted("start")).toEqual([["/srv/nope"]]);
  });

  it("does not ask about an empty field, which means the workspace", async () => {
    const w = await mountForm("");
    await input(w).trigger("keydown.enter");
    await flushPromises();
    expect(askedFor).toEqual([]);
    expect(w.emitted("start")).toEqual([["/home/me/ws"]]);
  });
});
