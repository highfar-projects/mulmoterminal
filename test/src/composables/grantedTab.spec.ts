import { describe, it, expect, vi, afterEach } from "vitest";
import { joinedPath, openGrantedTab, requestFileGrant, type GrantedTabDeps } from "../../../src/composables/grantedTab";

const fakeTab = () => {
  const tab = { opener: {} as unknown, location: { replace: vi.fn() }, document: { title: "", body: { textContent: "" } } };
  return tab;
};

const depsWith = (tab: ReturnType<typeof fakeTab> | null, result: Awaited<ReturnType<GrantedTabDeps["requestGrant"]>>) => {
  const requestGrant = vi.fn(async () => result);
  const deps: GrantedTabDeps = {
    openBlank: () => tab as unknown as Window,
    requestGrant,
    problemText: (reason, absPath) => `${reason}:${absPath}`,
    origin: "http://localhost:34567",
  };
  return { deps, requestGrant };
};

describe("openGrantedTab", () => {
  it("opens the tab before asking, cuts it off from the app, then sends it to the granted URL", async () => {
    const tab = fakeTab();
    const order: string[] = [];
    const { deps } = depsWith(tab, { ok: true, url: "/api/files/granted/t/clip.mp4" });
    const openBlank = deps.openBlank;
    deps.openBlank = () => {
      order.push("open");
      return openBlank();
    };
    const requestGrant = deps.requestGrant;
    deps.requestGrant = async (p) => {
      order.push("request");
      return requestGrant(p);
    };
    await openGrantedTab("/tmp/clip.mp4", deps);
    expect(order).toEqual(["open", "request"]);
    expect(tab.opener).toBeNull();
    expect(tab.location.replace).toHaveBeenCalledWith("http://localhost:34567/api/files/granted/t/clip.mp4");
  });

  it("says in the tab that a missing file is missing", async () => {
    const tab = fakeTab();
    await openGrantedTab("/tmp/gone.mp4", depsWith(tab, { ok: false, reason: "missing" }).deps);
    expect(tab.location.replace).not.toHaveBeenCalled();
    expect(tab.document.body.textContent).toBe("missing:/tmp/gone.mp4");
    expect(tab.document.title).toBe("missing:/tmp/gone.mp4");
  });

  it("asks nothing when the browser would not open a tab", async () => {
    const { deps, requestGrant } = depsWith(null, { ok: true, url: "/x" });
    await openGrantedTab("/tmp/clip.mp4", deps);
    expect(requestGrant).not.toHaveBeenCalled();
  });
});

describe("requestFileGrant", () => {
  afterEach(() => vi.unstubAllGlobals());
  const answer = (status: number, body: unknown) =>
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: status === 200, status, json: async () => body })),
    );

  it("reads the URL, and tells a missing file from a refusal", async () => {
    answer(200, { url: "/api/files/granted/t/a.png" });
    expect(await requestFileGrant("/a.png")).toEqual({ ok: true, url: "/api/files/granted/t/a.png" });
    answer(404, { error: "file not found" });
    expect(await requestFileGrant("/a.png")).toEqual({ ok: false, reason: "missing" });
    answer(415, { error: "no" });
    expect(await requestFileGrant("/a.png")).toEqual({ ok: false, reason: "refused" });
    answer(200, { nope: true });
    expect(await requestFileGrant("/a.png")).toEqual({ ok: false, reason: "refused" });
  });

  it("is a refusal, not a throw, when the request fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Promise.reject(new Error("offline"))),
    );
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await requestFileGrant("/a.png")).toEqual({ ok: false, reason: "refused" });
  });
});

describe("joinedPath", () => {
  it("puts a rebased path back together without doubling the root slash", () => {
    expect(joinedPath("/", "a.mp3")).toBe("/a.mp3");
    expect(joinedPath("/tmp/out", "clip.mp4")).toBe("/tmp/out/clip.mp4");
    expect(joinedPath("~/Pictures", "a.png")).toBe("~/Pictures/a.png");
    expect(joinedPath("C:/Users/me", "a.pdf")).toBe("C:/Users/me/a.pdf");
  });
});
