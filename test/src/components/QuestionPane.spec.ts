import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import QuestionPane from "../../../src/components/QuestionPane.vue";
import type { AskQuestion, AskQuestionEvent } from "../../../common/askQuestion";

// What the pane emits IS the answer: the grid turns the emitted indexes into the keystrokes that
// drive the real dialog, and an index off by one presses the wrong row of a menu the user cannot
// see from here. So these pin the emitted picks rather than the rendering.
//
// The component is imported at module scope, not inside a test: an import inside an `it` bills the
// whole module graph's transform against the first test's timeout (#1314).

const question = (label: string, options: string[], multiSelect = false): AskQuestion => ({
  question: `${label}?`,
  header: label,
  options: options.map((option) => ({ label: option })),
  multiSelect,
});

const event = (questions: AskQuestion[]): AskQuestionEvent => ({ sessionId: "s1", toolUseId: "t1", questions });

const mountPane = (questions: AskQuestion[]) => mount(QuestionPane, { props: { event: event(questions) } });

const options = (w: ReturnType<typeof mountPane>) => w.findAll('[data-testid="question-option"]');

describe("QuestionPane", () => {
  it("says nothing is being asked when there is no question", () => {
    const w = mount(QuestionPane, { props: { event: null } });
    expect(w.text()).toContain("Nothing is being asked");
    expect(options(w)).toHaveLength(0);
  });

  it("renders every option of every question", () => {
    const w = mountPane([question("Color", ["Red", "Blue"]), question("Size", ["Small", "Large"])]);
    expect(options(w).map((button) => button.text())).toEqual(["Red", "Blue", "Small", "Large"]);
  });

  // The common shape. A second click on a Send button would make the pane slower than the dialog.
  it("answers on the click for a lone single-select question", async () => {
    const w = mountPane([question("Color", ["Red", "Blue"])]);
    expect(w.find('[data-testid="question-send-btn"]').exists()).toBe(false);

    await options(w)[1]?.trigger("click");

    expect(w.emitted("answer")).toEqual([[[[1]]]]);
  });

  it("waits for Send once there is more than one question", async () => {
    const w = mountPane([question("Color", ["Red", "Blue"]), question("Size", ["Small", "Large"])]);
    const send = w.find('[data-testid="question-send-btn"]');
    expect(send.attributes("disabled")).toBeDefined();

    await options(w)[0]?.trigger("click");
    expect(w.emitted("answer")).toBeUndefined(); // one question still unanswered
    await options(w)[3]?.trigger("click");
    await w.find('[data-testid="question-send-btn"]').trigger("click");

    expect(w.emitted("answer")).toEqual([[[[0], [1]]]]);
  });

  // The keystrokes only ever walk DOWN the option list, so the picks have to come out ascending
  // however they were clicked — common/askQuestion.ts refuses to build a sequence otherwise.
  it("keeps multi-select picks ascending, whatever order they were clicked in", async () => {
    const w = mountPane([question("Toppings", ["Nuts", "Cream", "Honey"], true)]);

    await options(w)[2]?.trigger("click");
    await options(w)[0]?.trigger("click");
    await w.find('[data-testid="question-send-btn"]').trigger("click");

    expect(w.emitted("answer")).toEqual([[[[0, 2]]]]);
  });

  it("toggles a multi-select option off when it is clicked again", async () => {
    const w = mountPane([question("Toppings", ["Nuts", "Cream"], true)]);

    await options(w)[0]?.trigger("click");
    await options(w)[0]?.trigger("click");
    await w.find('[data-testid="question-send-btn"]').trigger("click");

    // Nothing chosen is a valid answer to a multi-select question — the dialog submits with no box
    // ticked — so this emits rather than refusing.
    expect(w.emitted("answer")).toEqual([[[[]]]]);
  });

  // A single-select question replaces its pick rather than accumulating: two picks would be
  // rejected downstream, and the pane would look answered while sending nothing.
  it("replaces the pick of a single-select question", async () => {
    const w = mountPane([question("Color", ["Red", "Blue"]), question("Size", ["Small", "Large"])]);

    await options(w)[0]?.trigger("click");
    await options(w)[1]?.trigger("click");
    await options(w)[2]?.trigger("click");
    await w.find('[data-testid="question-send-btn"]').trigger("click");

    expect(w.emitted("answer")).toEqual([[[[1], [0]]]]);
  });

  // The pane outlives one question: the next arrives on the same open pane, and a pick left over
  // from the last one would be sent against a menu it never belonged to.
  it("forgets the previous question's picks when a new one arrives", async () => {
    const w = mountPane([question("Toppings", ["Nuts", "Cream"], true)]);
    await options(w)[0]?.trigger("click");

    await w.setProps({ event: { sessionId: "s1", toolUseId: "t2", questions: [question("Toppings", ["Nuts", "Cream"], true)] } });
    await w.find('[data-testid="question-send-btn"]').trigger("click");

    expect(w.emitted("answer")).toEqual([[[[]]]]);
  });
});
