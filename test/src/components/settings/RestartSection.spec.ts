// @vitest-environment jsdom
// Fork-only: Settings' restart button says whether a restart can bring up a newer build, and asks
// the server once.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import type { UpdateStatus } from "../../../../common/updateStatus";

const jsonResponse = (body: unknown): Response => new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });

const status = (relaunch: boolean): UpdateStatus => ({
  ready: true,
  install: "npm",
  distribution: "fork",
  version: "11.5.0",
  commit: "78f0791be",
  latest: null,
  notice: null,
  relaunch,
});

const fetchMock = vi.fn();

// The status and the restart state are module-level, so each case starts from a fresh module graph
// — which is why the component is imported here rather than at module scope.
async function mountWith(relaunch: boolean) {
  fetchMock.mockImplementation(async (input: RequestInfo | URL) =>
    String(input) === "/api/restart" ? jsonResponse({ restarting: true, relaunch }) : jsonResponse(status(relaunch)),
  );
  vi.stubGlobal("fetch", fetchMock);
  vi.resetModules();
  const RestartSection = (await import("../../../../src/components/settings/RestartSection.vue")).default;
  const w = mount(RestartSection);
  await flushPromises();
  return w;
}

beforeEach(() => {
  vi.useFakeTimers();
  fetchMock.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("RestartSection", () => {
  it("says a restart fetches the latest version under the wrapper loop", async () => {
    const w = await mountWith(true);
    expect(w.text()).toContain("latest version");
    expect(w.text()).not.toContain("wrapper loop");
  });

  it("says a restart keeps the same version, and how to change that, without it", async () => {
    const w = await mountWith(false);
    expect(w.text()).toContain("same version");
    expect(w.text()).toContain("wrapper loop");
  });

  it("asks the server to restart once, and disables itself while it does", async () => {
    const w = await mountWith(true);
    await w.find('[data-testid="restart-server"]').trigger("click");
    await w.find('[data-testid="restart-server"]').trigger("click");
    await flushPromises();
    const restarts = fetchMock.mock.calls.filter(([input]) => String(input) === "/api/restart");
    expect(restarts).toHaveLength(1);
    expect(restarts[0]?.[1]).toMatchObject({ method: "POST" });
    expect(w.find('[data-testid="restart-server"]').attributes("disabled")).toBeDefined();
  });
});
