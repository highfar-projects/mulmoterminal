// The new-build form shows one example per task in each group, and the rest behind a button that opens and closes.
import { describe, it, expect, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";

vi.mock("../../../../src/composables/useBlueprintsView", () => ({ takeFormFill: () => null, keepFormFill: vi.fn() }));
vi.mock("../../../../src/composables/useNewTerminal", () => ({ openTerminalAt: vi.fn() }));
const example = (id: string, usecase: string, base: string) => ({ id, title: id, description: `${id} の説明`, base, usecase, answers: {}, samples: [] });
vi.mock("../../../../src/composables/blueprintsApi", () => ({
  listPacks: async () => ({
    ok: true,
    value: {
      packs: [
        { slug: "docs", manifest: { slug: "docs", kind: "base", title: "文書のフォルダ", version: "0.1.0", description: "", platform: "local" } },
        { slug: "local", manifest: { slug: "local", kind: "base", title: "ローカル", version: "0.1.0", description: "", platform: "local" } },
        { slug: "polish", manifest: { slug: "polish", kind: "usecase", title: "整える", version: "0.1.0", description: "", bases: ["docs"] } },
        { slug: "ask", manifest: { slug: "ask", kind: "usecase", title: "尋ねる", version: "0.1.0", description: "", bases: ["docs"] } },
        { slug: "product", manifest: { slug: "product", kind: "usecase", title: "作る", version: "0.1.0", description: "", bases: ["local"] } },
      ],
    },
  }),
  listPresets: async () => ({
    ok: true,
    value: {
      presets: [
        example("polish-1", "polish", "docs"),
        example("ask-1", "ask", "docs"),
        example("polish-2", "polish", "docs"),
        example("polish-3", "polish", "docs"),
        example("app-1", "product", "local"),
      ],
    },
  }),
  previewPair: vi.fn(async () => ({ ok: true, value: { hearing: { questions: [] }, steps: [] } })),
  folderPresentPaths: vi.fn(async () => ({ ok: true, value: { present: [] } })),
  startRun: vi.fn(),
  suggestFolder: vi.fn(async () => ({ ok: true, value: { path: null } })),
  listKnownFolders: vi.fn(async () => ({ ok: true, value: { folders: [] } })),
}));

import BlueprintNewBuild from "../../../../src/components/blueprints/BlueprintNewBuild.vue";

const shownIn = (wrapper: ReturnType<typeof mount>) =>
  wrapper
    .findAll('[data-testid="blueprint-preset-group"]')
    .map((group) => [
      group.get("h4").text(),
      group.findAll('[data-testid="blueprint-preset"] span:first-child').map((title) => title.text()),
      group.find('[data-testid="blueprint-preset-more"]').exists() ? group.get('[data-testid="blueprint-preset-more"]').text() : null,
    ]);

describe("the examples in the new-build form", () => {
  it("shows one per task, and opens and closes the rest of a group", async () => {
    const wrapper = mount(BlueprintNewBuild);
    await flushPromises();
    expect(shownIn(wrapper)).toEqual([
      ["文書のフォルダ", ["polish-1", "ask-1"], "expand_more Show 2 more examples"],
      ["ローカル", ["app-1"], null],
    ]);
    await wrapper.get('[data-testid="blueprint-preset-more"]').trigger("click");
    expect(shownIn(wrapper)[0]).toEqual(["文書のフォルダ", ["polish-1", "ask-1", "polish-2", "polish-3"], "expand_less Show fewer examples"]);
    await wrapper.get('[data-testid="blueprint-preset-more"]').trigger("click");
    expect(shownIn(wrapper)[0]?.[1]).toEqual(["polish-1", "ask-1"]);
  });

  it("keeps each description to a few lines on its card, and shows the chosen one's in full", async () => {
    const wrapper = mount(BlueprintNewBuild);
    await flushPromises();
    const description = wrapper.get('[data-testid="blueprint-preset-description"]');
    expect(description.classes()).toContain("line-clamp-3");
    expect(description.attributes("title")).toBe("polish-1 の説明");
    expect(wrapper.find('[data-testid="blueprint-preset-applied-description"]').exists()).toBe(false);
    await wrapper.get('[data-testid="blueprint-preset-use"]').trigger("click");
    await flushPromises();
    expect(wrapper.get('[data-testid="blueprint-preset-applied-description"]').text()).toBe("polish-1 の説明");
  });
});
