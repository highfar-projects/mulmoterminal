// #2622. The button rows Settings shows, and a saved change updating them and the cells.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { changeHeaderButtons, globalHeaderButtons, setGlobalHeaderButtons } from "../../../src/composables/headerButtonsConfig";
import { headerConfigRevision } from "../../../src/composables/headerConfigRevision";
import { headerButtonCount } from "../../../src/composables/headerConfigSummary";

const answering = (status: number, body: unknown) =>
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify(body), { status })),
  );

beforeEach(() => {
  setGlobalHeaderButtons(null);
  headerConfigRevision.value = 0;
});

describe("setGlobalHeaderButtons", () => {
  it("describes each kind of entry, and keeps null as unconfigured", () => {
    expect(globalHeaderButtons.value).toBeNull();
    setGlobalHeaderButtons([
      { id: "b", label: "Build", run: "shell", cmd: "yarn build" },
      { id: "c", label: "Compact", run: "input", text: "/compact", order: 3 },
      { id: "o", label: "Docs", run: "open", open: { url: "x" } },
      { id: "f", label: "Tools", items: [{ id: "x" }, { id: "y" }] },
      { id: "p", label: "PR", run: "open", open: { pr: true } },
      { id: "a", label: "Files", run: "action", action: "pane-files" },
      { id: "bad", label: "Bad", run: "nope" },
      "junk",
    ]);
    expect(globalHeaderButtons.value).toEqual([
      { id: "b", label: "Build", kind: "shell", detail: "yarn build", ordered: false },
      { id: "c", label: "Compact", kind: "input", detail: "/compact", ordered: true },
      { id: "o", label: "Docs", kind: "open", detail: "url: x", ordered: false },
      { id: "f", label: "Tools", kind: "folder", detail: "2", ordered: false },
      { id: "p", label: "PR", kind: "open", detail: "pr", ordered: false },
      { id: "a", label: "Files", kind: "action", detail: "pane-files", ordered: false },
    ]);
  });
});

describe("changeHeaderButtons", () => {
  it("adopts the answered list, its count, and makes the cells ask again", async () => {
    answering(200, { buttons: [{ id: "b", label: "Build", run: "shell", cmd: "x" }] });
    expect((await changeHeaderButtons("add", {})).ok).toBe(true);
    expect(globalHeaderButtons.value).toHaveLength(1);
    expect(headerButtonCount.value).toBe(1);
    expect(headerConfigRevision.value).toBe(1);
  });

  it("shows the saved list a refusal carries, without asking the cells again", async () => {
    answering(409, { error: "missing", buttons: [{ id: "b", label: "Build", run: "shell", cmd: "x" }] });
    expect(await changeHeaderButtons("remove", { id: "gone" })).toMatchObject({ ok: false, problem: "missing" });
    expect(globalHeaderButtons.value).toEqual([{ id: "b", label: "Build", kind: "shell", detail: "x", ordered: false }]);
    expect(headerConfigRevision.value).toBe(0);
  });

  it("changes nothing on a refusal that carries no list", async () => {
    answering(500, { error: "config.json is unreadable" });
    expect(await changeHeaderButtons("move", {})).toMatchObject({ ok: false, problem: null });
    expect(globalHeaderButtons.value).toBeNull();
  });
});
