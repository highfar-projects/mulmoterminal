// A list answer, one item per line, keeps its lines: a single-line input would drop them.
import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import BlueprintHearingField from "../../../../src/components/blueprints/BlueprintHearingField.vue";
import { hearingSchema } from "../../../../common/blueprint/hearing";

const [listQuestion, lineQuestion] = hearingSchema.parse({
  questions: [
    { id: "questions", label: "質問（1 行に 1 つ）", why: "w", kind: "text", lines: true },
    { id: "topic", label: "何について", why: "w", kind: "text" },
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
