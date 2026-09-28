// The new-build form and an example that brings sample documents: it says which files it will place, sends the
// example's id when the build starts, and forgets the example when the pair is changed by hand.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";

const { startRun, suggestFolder } = vi.hoisted(() => ({ startRun: vi.fn(), suggestFolder: vi.fn() }));
vi.mock("../../../../src/composables/blueprintsApi", () => ({
  listPacks: async () => ({
    ok: true,
    value: {
      packs: [
        { slug: "docs", manifest: { slug: "docs", kind: "base", title: "文書のフォルダ", version: "0.1.0", description: "", platform: "local" } },
        { slug: "review", manifest: { slug: "review", kind: "usecase", title: "文書を読み解く", version: "0.1.0", description: "", bases: ["docs"] } },
        { slug: "ask", manifest: { slug: "ask", kind: "usecase", title: "文書に尋ねる", version: "0.1.0", description: "", bases: ["docs"] } },
      ],
    },
  }),
  listPresets: async () => ({
    ok: true,
    value: {
      presets: [
        {
          id: "itaku-keiyaku",
          title: "業務委託契約書を読み解く",
          description: "",
          base: "docs",
          usecase: "review",
          answers: { documents: "contract.txt" },
          samples: ["contract.txt"],
        },
      ],
    },
  }),
  previewPair: async () => ({ ok: true, value: { hearing: { questions: [{ id: "documents", label: "文書", why: "", kind: "text" }] }, steps: [] } }),
  startRun,
  suggestFolder,
}));

import BlueprintNewBuild from "../../../../src/components/blueprints/BlueprintNewBuild.vue";
import { en } from "../../../../src/i18n/en";

const mountForm = async () => {
  const wrapper = mount(BlueprintNewBuild);
  await flushPromises();
  return wrapper;
};

describe("starting a document blueprint from an example", () => {
  beforeEach(() => {
    startRun.mockReset();
    startRun.mockResolvedValue({ ok: true, value: { runId: "run-1" } });
    suggestFolder.mockReset();
    suggestFolder.mockResolvedValue({ ok: true, value: { path: null } });
  });

  it("names the sample documents and sends the example's id", async () => {
    const wrapper = await mountForm();
    await wrapper.get('[data-testid="blueprint-preset-use"]').trigger("click");
    await flushPromises();
    expect(wrapper.get('[data-testid="blueprint-preset-samples"]').text()).toContain("contract.txt");
    await wrapper.get('[data-testid="blueprint-project-dir"]').setValue("/tmp/example");
    await wrapper.get('[data-testid="blueprint-new-form"]').trigger("submit");
    await flushPromises();
    expect(startRun).toHaveBeenCalledWith(expect.objectContaining({ base: "docs", usecase: "review", preset: "itaku-keiyaku" }));
  });

  it("forgets the example, and its samples, when the usecase is changed by hand", async () => {
    const wrapper = await mountForm();
    await wrapper.get('[data-testid="blueprint-preset-use"]').trigger("click");
    await flushPromises();
    await wrapper.get('[data-testid="blueprint-usecase"]').setValue("ask");
    await flushPromises();
    expect(wrapper.find('[data-testid="blueprint-preset-samples"]').exists()).toBe(false);
    await wrapper.get('[data-testid="blueprint-project-dir"]').setValue("/tmp/example");
    await wrapper.findComponent({ name: "BlueprintHearingField" }).vm.$emit("update", "contract.txt");
    await wrapper.get('[data-testid="blueprint-new-form"]').trigger("submit");
    await flushPromises();
    expect(startRun).toHaveBeenCalledTimes(1);
    expect(startRun.mock.calls[0]?.[0]).toEqual({ projectDir: "/tmp/example", base: "docs", usecase: "ask", answers: { documents: "contract.txt" } });
  });

  it("words a refusal from its code, not from the server's English", async () => {
    startRun.mockResolvedValue({ ok: false, error: "server English", refusal: { code: "samples-clash", files: ["contract.txt"] } });
    const wrapper = await mountForm();
    await wrapper.get('[data-testid="blueprint-preset-use"]').trigger("click");
    await flushPromises();
    await wrapper.get('[data-testid="blueprint-project-dir"]').setValue("/tmp/example");
    await wrapper.get('[data-testid="blueprint-new-form"]').trigger("submit");
    await flushPromises();
    expect(wrapper.get('[data-testid="blueprint-new-error"]').text()).toBe(en.blueprints.refusals.samplesClash.replace("{files}", "contract.txt"));
  });

  it("offers a new folder for the example when none is typed, and says so while it is unchanged", async () => {
    suggestFolder.mockResolvedValue({ ok: true, value: { path: "/Users/me/work/itaku-keiyaku" } });
    const wrapper = await mountForm();
    await wrapper.get('[data-testid="blueprint-preset-use"]').trigger("click");
    await flushPromises();
    expect(suggestFolder).toHaveBeenCalledWith("itaku-keiyaku");
    const field = wrapper.get<HTMLInputElement>('[data-testid="blueprint-project-dir"]');
    expect(field.element.value).toBe("/Users/me/work/itaku-keiyaku");
    expect(wrapper.find('[data-testid="blueprint-folder-suggested"]').exists()).toBe(true);
    await field.setValue("/Users/me/elsewhere");
    expect(wrapper.find('[data-testid="blueprint-folder-suggested"]').exists()).toBe(false);
  });

  it("never replaces a folder the person typed, even one typed while the suggestion was on its way", async () => {
    const wrapper = await mountForm();
    await wrapper.get('[data-testid="blueprint-project-dir"]').setValue("/Users/me/mine");
    await wrapper.get('[data-testid="blueprint-preset-use"]').trigger("click");
    await flushPromises();
    expect(suggestFolder).not.toHaveBeenCalled();

    const settle: { answer: (value: unknown) => void } = { answer: () => undefined };
    suggestFolder.mockReturnValue(new Promise((resolve) => (settle.answer = resolve)));
    const late = await mountForm();
    await late.get('[data-testid="blueprint-preset-use"]').trigger("click");
    await late.get('[data-testid="blueprint-project-dir"]').setValue("/Users/me/typed");
    settle.answer({ ok: true, value: { path: "/Users/me/work/itaku-keiyaku" } });
    await flushPromises();
    expect(late.get<HTMLInputElement>('[data-testid="blueprint-project-dir"]').element.value).toBe("/Users/me/typed");
  });
});
