// #2622. A saved chip change updates the list and makes the cells ask for their header again; a
// stale refusal shows the list the server now holds, and any other refusal changes nothing.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { changeHeaderChips, globalHeaderChips, setGlobalHeaderChips } from "../../../src/composables/headerChipsConfig";
import { headerConfigRevision } from "../../../src/composables/headerConfigRevision";
import { headerChipCount } from "../../../src/composables/headerConfigSummary";

const answering = (status: number, body: unknown) =>
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify(body), { status })),
  );

beforeEach(() => {
  setGlobalHeaderChips(["git"]);
  headerConfigRevision.value = 0;
});

describe("setGlobalHeaderChips", () => {
  it("keeps null as unconfigured and drops entries that are not chips", () => {
    setGlobalHeaderChips(undefined);
    expect(globalHeaderChips.value).toBeNull();
    setGlobalHeaderChips(["git", 3, { label: "a", text: "b" }, { label: "a" }]);
    expect(globalHeaderChips.value).toEqual(["git", { label: "a", text: "b" }]);
  });
});

describe("changeHeaderChips", () => {
  it("adopts the answered list and bumps the revision on success", async () => {
    answering(200, { chips: ["git", "ctx"] });
    expect((await changeHeaderChips("add", { builtin: "ctx" })).ok).toBe(true);
    expect(globalHeaderChips.value).toEqual(["git", "ctx"]);
    expect(headerChipCount.value).toBe(2);
    expect(headerConfigRevision.value).toBe(1);
  });

  it("shows the current list on a stale refusal, without a revision bump", async () => {
    answering(409, { error: "stale", chips: ["ctx"] });
    expect(await changeHeaderChips("remove", { index: 0, chip: "git" })).toMatchObject({ ok: false, problem: "stale" });
    expect(globalHeaderChips.value).toEqual(["ctx"]);
    expect(headerConfigRevision.value).toBe(0);
  });

  it("changes nothing on any other refusal", async () => {
    answering(409, { error: "label", chips: [] });
    expect(await changeHeaderChips("add", {})).toMatchObject({ ok: false, problem: "label" });
    expect(globalHeaderChips.value).toEqual(["git"]);
  });
});
