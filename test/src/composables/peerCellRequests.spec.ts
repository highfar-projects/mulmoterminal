// The per-cell requests a PEER cell makes (common/peers.ts): each goes to the server the session and
// its directory are on, through this server's relay.
import { describe, it, expect, vi, afterEach } from "vitest";
import { nextTick, ref } from "vue";

vi.mock("../../../src/composables/usePubSub", () => ({ usePubSub: () => ({ subscribe: () => () => {} }) }));

import { reapSessionOnServer, switchTokenOnServer } from "../../../src/composables/restartSession";
import { dropUploadUrl } from "../../../src/components/dropUpload";
import { dirConfigKey, fetchDirConfig, useDirConfig } from "../../../src/composables/useDirConfig";
import { devcontainerStatus } from "../../../src/composables/useDevcontainerOffer";

const answered = (body: unknown): Response => new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
const calls: string[] = [];
const stub = (body: unknown) =>
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      calls.push(String(url));
      return answered(body);
    }),
  );

afterEach(() => {
  vi.unstubAllGlobals();
  calls.length = 0;
});

describe("ending a peer's session", () => {
  it("asks the peer to terminate it — the restart and the close button both go through here", async () => {
    stub({ ok: true, ended: true });
    expect(await reapSessionOnServer("abc", "win")).toBe(true);
    expect(calls).toEqual(["/peer/win/api/session/abc/terminate"]);
  });

  it("asks the peer to switch its token", async () => {
    stub({ ok: true, ended: true });
    await switchTokenOnServer("abc", "t1", "win");
    expect(calls).toEqual(["/peer/win/api/session/abc/switch-token"]);
  });
});

describe("a dropped or pasted file for a peer's session", () => {
  it("is saved by the peer, whose disk the session reads", () => {
    expect(dropUploadUrl("abc", "win")).toBe("/peer/win/api/session/abc/drop");
    expect(dropUploadUrl("abc")).toBe("/api/session/abc/drop");
  });
});

describe("a peer directory's config", () => {
  it("is read from the peer, with its own links pointed back through the relay", async () => {
    stub({ name: "theirs", iconUrl: "/api/dir-icon?cwd=%2Fp", backgroundImage: { url: "/api/dir-background?cwd=%2Fp", opacity: 0.3, fit: "cover" } });
    const config = await fetchDirConfig(dirConfigKey("win", "/p"));
    expect(calls).toEqual(["/peer/win/api/dir-config?cwd=%2Fp"]);
    expect(config.name).toBe("theirs");
    expect(config.iconUrl).toBe("/peer/win/api/dir-icon?cwd=%2Fp");
    expect(config.backgroundImage?.url).toBe("/peer/win/api/dir-background?cwd=%2Fp");
  });

  // The same path on two machines is two directories.
  it("is cached apart from the same path on this server", async () => {
    stub({ name: "here" });
    await fetchDirConfig("/q");
    stub({ name: "there" });
    const there = await fetchDirConfig(dirConfigKey("win", "/q"));
    expect(there.name).toBe("there");
    expect(calls).toEqual(["/api/dir-config?cwd=%2Fq", "/peer/win/api/dir-config?cwd=%2Fq"]);
  });

  it("is what useDirConfig shows for a cell on the peer", async () => {
    stub({ name: "peer-dir" });
    const { config } = useDirConfig(ref("/r"), ref("win"));
    await nextTick();
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));
    expect(config.value.name).toBe("peer-dir");
    expect(calls).toContain("/peer/win/api/dir-config?cwd=%2Fr");
  });
});

describe("a peer directory's devcontainer", () => {
  it("is asked of the peer", async () => {
    stub({ hasConfig: true, enabled: false });
    expect((await devcontainerStatus("/p", "win"))?.hasConfig).toBe(true);
    expect(calls).toEqual(["/peer/win/api/devcontainer/status?cwd=%2Fp"]);
  });
});
