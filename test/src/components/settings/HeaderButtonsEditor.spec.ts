// #2622. The header buttons in Settings: added as a command or as text for the agent, removed and
// moved by id, and an entry placed by its own order number is not offered a move.
import { describe, it, expect, vi, afterEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { ref } from "vue";
import { i18n } from "../../../../src/i18n";

const state = vi.hoisted(() => ({
  result: { ok: true, body: {} } as { ok: true; body: object } | { ok: false; problem: string | null; body: null },
  sent: [] as [string, unknown][],
}));
const rows = ref<unknown[] | null>(null);
vi.mock("../../../../src/composables/headerButtonsConfig", () => ({
  globalHeaderButtons: rows,
  changeHeaderButtons: async (action: string, payload: unknown) => {
    state.sent.push([action, payload]);
    return state.result;
  },
}));

const HeaderButtonsEditor = (await import("../../../../src/components/settings/HeaderButtonsEditor.vue")).default;

afterEach(() => {
  state.result = { ok: true, body: {} };
  state.sent.length = 0;
  rows.value = null;
});

const mountEditor = () => mount(HeaderButtonsEditor, { global: { plugins: [i18n] } });
const field = (w: ReturnType<typeof mountEditor>, id: string) => w.find(`input[data-testid="${id}"], [data-testid="${id}"] input`);
const row = (id: string, ordered = false) => ({ id, label: id.toUpperCase(), kind: "shell", detail: `run ${id}`, ordered });

describe("HeaderButtonsEditor", () => {
  it("says the built-in button applies when nothing is set, and offers no reset", () => {
    const w = mountEditor();
    expect(w.find('[data-testid="header-buttons-default"]').exists()).toBe(true);
    expect(w.find('[data-testid="header-buttons-reset"]').exists()).toBe(false);
  });

  it("sends a new button as typed, for either kind", async () => {
    const w = mountEditor();
    await field(w, "header-button-label").setValue("Build");
    await field(w, "header-button-payload").setValue("yarn build");
    await field(w, "header-button-icon").setValue("build");
    await w.find('[data-testid="header-button-add"]').trigger("click");
    await flushPromises();
    await w.find('[data-testid="header-button-run"]').setValue("input");
    await field(w, "header-button-label").setValue("Compact");
    await field(w, "header-button-payload").setValue("/compact");
    await field(w, "header-button-when").setValue("agent == claude");
    await w.find('[data-testid="header-button-add"]').trigger("click");
    await flushPromises();
    expect(state.sent).toEqual([
      ["add", { run: "shell", label: "Build", icon: "build", payload: "yarn build", when: "" }],
      ["add", { run: "input", label: "Compact", icon: "", payload: "/compact", when: "agent == claude" }],
    ]);
  });

  it("moves and removes by id, and offers no move at an end or on an ordered entry", async () => {
    rows.value = [row("a"), row("b"), row("c", true)];
    const w = mountEditor();
    const items = w.findAll('[data-testid="settings-header-buttons"] li');
    const buttons = (i: number) => items[i].findAll("button");
    expect(buttons(0)[0].attributes("disabled")).toBeDefined();
    expect(buttons(2)[0].attributes("disabled")).toBeDefined();
    expect(buttons(2)[1].attributes("disabled")).toBeDefined();
    await buttons(0)[1].trigger("click");
    await flushPromises();
    await buttons(1)[2].trigger("click");
    await flushPromises();
    expect(state.sent).toEqual([
      ["move", { id: "a", delta: 1 }],
      ["remove", { id: "b" }],
    ]);
  });

  it("says why a change was refused, and resets", async () => {
    rows.value = [];
    state.result = { ok: false, problem: "full", body: null };
    const w = mountEditor();
    expect(w.find('[data-testid="header-buttons-none"]').exists()).toBe(true);
    await w.find('[data-testid="header-buttons-reset"]').trigger("click");
    await flushPromises();
    expect(state.sent).toEqual([["reset", {}]]);
    expect(w.find('[data-testid="header-button-problem"]').text()).toBe(i18n.global.t("headerButtons.problems.full"));
  });
});
