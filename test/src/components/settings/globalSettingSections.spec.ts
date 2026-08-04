import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import GitHubSection from "../../../../src/components/settings/GitHubSection.vue";
import SessionSection from "../../../../src/components/settings/SessionSection.vue";
import { setIssueWorkComments } from "../../../../src/composables/issueWorkComments";
import { setPrWorkdirFooter } from "../../../../src/composables/prWorkdirFooter";
import { setAppendSystemPrompt } from "../../../../src/composables/appendSystemPrompt";
import { setDecisionDigest } from "../../../../src/composables/decisionDigest";
import { setWorklogEnabled, setWorklogIntervalHours } from "../../../../src/composables/worklog";

// The sections that gave a config.json-only setting a control (#1401). What matters about each is
// that flipping it POSTs the RIGHT FIELD: every one is a partial update, so a section naming the
// wrong key writes a setting the user never touched and leaves theirs unchanged — and nothing in
// the UI would show either half of that.

// The POST bodies, in order. The echo answers with what was sent, which is what the server does.
let posts: Record<string, unknown>[] = [];

beforeEach(() => {
  posts = [];
  globalThis.fetch = vi.fn(async (_url: unknown, init?: { body?: string }) => {
    const body: Record<string, unknown> = init?.body ? JSON.parse(init.body) : {};
    posts.push(body);
    return { ok: true, json: async () => body };
  }) as unknown as typeof fetch;
});

const toggleAt = async (wrapper: ReturnType<typeof mount>, index: number, checked: boolean) => {
  const box = wrapper.findAll("input[type=checkbox]")[index];
  await box.setValue(checked);
};

describe("GitHubSection", () => {
  beforeEach(() => {
    setIssueWorkComments(true);
    setPrWorkdirFooter(true);
  });

  it("posts issueWorkComments when the work-comment box is unticked", async () => {
    const wrapper = mount(GitHubSection);
    await toggleAt(wrapper, 0, false);
    expect(posts).toEqual([{ issueWorkComments: false }]);
  });

  it("posts prWorkdirFooter when the footer box is unticked", async () => {
    const wrapper = mount(GitHubSection);
    await toggleAt(wrapper, 1, false);
    expect(posts).toEqual([{ prWorkdirFooter: false }]);
  });

  // Normalized before it is stored, not merely before it is judged: the server would reduce a
  // pasted URL to its hostname anyway, so a list showing the raw input would disagree with the
  // config the moment it was saved.
  it("stores a pasted GitLab URL as its hostname", async () => {
    const wrapper = mount(GitHubSection);
    await wrapper.find("input[type=text]").setValue("https://gitlab.example.com/");
    await wrapper
      .findAll("button")
      .find((b) => b.text() === "Add")
      ?.trigger("click");
    expect(posts).toEqual([{ gitlabHosts: ["gitlab.example.com"] }]);
  });

  it("refuses a host that is not a hostname", async () => {
    const wrapper = mount(GitHubSection);
    await wrapper.find("input[type=text]").setValue("gitlab.example.com/group/project");
    expect(
      wrapper
        .findAll("button")
        .find((b) => b.text() === "Add")
        ?.attributes("disabled"),
    ).toBeDefined();
  });
});

describe("SessionSection", () => {
  beforeEach(() => {
    setAppendSystemPrompt(true);
    setDecisionDigest(false);
    setWorklogEnabled(true);
    setWorklogIntervalHours(6);
  });

  it("posts appendSystemPrompt when the closing-summary box is unticked", async () => {
    const wrapper = mount(SessionSection);
    await toggleAt(wrapper, 0, false);
    expect(posts).toEqual([{ appendSystemPrompt: false }]);
  });

  it("posts decisionDigest when the digest box is ticked", async () => {
    const wrapper = mount(SessionSection);
    await toggleAt(wrapper, 1, true);
    expect(posts).toEqual([{ decisionDigest: true }]);
  });

  it("posts worklogEnabled when the log box is unticked", async () => {
    const wrapper = mount(SessionSection);
    await toggleAt(wrapper, 2, false);
    expect(posts).toEqual([{ worklogEnabled: false }]);
  });

  it("posts the new interval when the stepper is nudged", async () => {
    const wrapper = mount(SessionSection);
    await wrapper
      .findAll("button")
      .find((b) => b.attributes("aria-label") === "Increase dev-work log interval")
      ?.trigger("click");
    expect(posts).toEqual([{ worklogIntervalHours: 7 }]);
  });

  // The stepper offers the range the SERVER clamps to, so a value it lets the user reach always
  // survives the save. One end is enough to pin that they are the same numbers.
  it("stops at the interval the server clamps to", async () => {
    setWorklogIntervalHours(168);
    const wrapper = mount(SessionSection);
    expect(
      wrapper
        .findAll("button")
        .find((b) => b.attributes("aria-label") === "Increase dev-work log interval")
        ?.attributes("disabled"),
    ).toBeDefined();
  });
});
