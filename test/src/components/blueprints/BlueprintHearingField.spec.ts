// A list answer, one item per line, keeps its lines: a single-line input would drop them.
import { describe, it, expect, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";

const { listSourceCollections } = vi.hoisted(() => ({ listSourceCollections: vi.fn() }));
vi.mock("../../../../src/composables/blueprintsApi", async (actual) => ({ ...(await actual<object>()), listSourceCollections }));
import BlueprintHearingField from "../../../../src/components/blueprints/BlueprintHearingField.vue";
import { hearingSchema } from "../../../../common/blueprint/hearing";

const [listQuestion, lineQuestion, fileQuestion, sourceQuestion] = hearingSchema.parse({
  questions: [
    { id: "questions", label: "質問（1 行に 1 つ）", why: "w", kind: "text", lines: true },
    { id: "topic", label: "何について", why: "w", kind: "text" },
    { id: "documents", label: "文書（このフォルダの中のファイルを 1 行に 1 つ）", why: "w", kind: "text", lines: true, pick: "files" },
    { id: "source", label: "元にするコレクション", why: "w", kind: "text", pick: "collection" },
  ],
}).questions;

describe("a one-per-line text question", () => {
  it("is a multi-line field that shows every line, and hands back what is typed with its newlines", async () => {
    if (!listQuestion) throw new Error("fixture");
    const wrapper = mount(BlueprintHearingField, { props: { question: listQuestion, answer: "期限は？\n日当は？" } });
    const field = wrapper.get<HTMLTextAreaElement>("textarea");
    expect(field.element.value).toBe("期限は？\n日当は？");
    await field.setValue("期限は？\n日当は？\n領収書は？");
    expect(wrapper.emitted("update")?.at(-1)).toEqual(["期限は？\n日当は？\n領収書は？"]);
  });

  it("leaves an ordinary text question a single-line input", () => {
    if (!lineQuestion) throw new Error("fixture");
    const wrapper = mount(BlueprintHearingField, { props: { question: lineQuestion, answer: "手引き" } });
    expect(wrapper.find("textarea").exists()).toBe(false);
    expect(wrapper.get<HTMLInputElement>("input").element.value).toBe("手引き");
  });
});

describe("a question whose lines are files in the folder", () => {
  it("offers to pick them from the folder the form names; other list questions do not", () => {
    if (!fileQuestion || !listQuestion) throw new Error("fixture");
    const files = mount(BlueprintHearingField, { props: { question: fileQuestion, answer: undefined, projectDir: "/work/docs" } });
    expect(files.find('[data-testid="blueprint-file-picker"]').exists()).toBe(true);
    const plain = mount(BlueprintHearingField, { props: { question: listQuestion, answer: undefined, projectDir: "/work/docs" } });
    expect(plain.find('[data-testid="blueprint-file-picker"]').exists()).toBe(false);
  });
});

describe("each kind renders one field", () => {
  it.each([
    [{ id: "kind", label: "k", why: "w", kind: "select", options: ["a", "b"] }, "select"],
    [{ id: "goals", label: "g", why: "w", kind: "multiselect", options: ["a"] }, "button"],
    [{ id: "ok", label: "o", why: "w", kind: "boolean" }, "button"],
    [{ id: "n", label: "n", why: "w", kind: "number" }, "input"],
  ])("%o has no stray text field beside it", (raw, only) => {
    const [question] = hearingSchema.parse({ questions: [raw] }).questions;
    if (!question) throw new Error("fixture");
    const wrapper = mount(BlueprintHearingField, { props: { question, answer: undefined, projectDir: "/work" } });
    expect(wrapper.findAll("textarea")).toHaveLength(0);
    expect(wrapper.findAll("input")).toHaveLength(only === "input" ? 1 : 0);
  });
});

describe("a question that picks a collection", () => {
  it("is a choice among the server's collections, not a field to type in", async () => {
    if (!sourceQuestion) throw new Error("fixture");
    listSourceCollections.mockResolvedValue({ ok: true, value: { collections: [{ slug: "books", title: "本" }] } });
    const wrapper = mount(BlueprintHearingField, { props: { question: sourceQuestion, answer: undefined } });
    await flushPromises();
    expect(wrapper.find('[data-testid="blueprint-collection-picker"]').exists()).toBe(true);
    expect(wrapper.find("input").exists()).toBe(false);
    await wrapper.get("select").setValue("books");
    expect(wrapper.emitted("update")).toEqual([["books"]]);
  });
});
