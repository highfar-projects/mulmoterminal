// @vitest-environment node
//
// The route that opens a folder in the OS file manager (#1447). It drives `spawnFirstOpener`, which
// `/api/files/reveal` and `/api/files/open` also drive — so what is pinned here is the part that is
// this route's own: the directory is handed over as the WHOLE argv, and nothing answers ok until a
// child has actually started.
import { describe, it, expect, beforeAll, vi } from "vitest";
import express from "express";
import { EventEmitter } from "node:events";
import path from "node:path";
import { appRequest } from "../../helpers/appRequest.js";
import { isRecord } from "../../../common/isRecord.js";
import { makeTempDir } from "../../support/tempDir";
import { mountOpenDirRoute, type Spawner } from "../../../server/files/open-dir.js";
import { openDirCommands } from "../../../server/files/spawnOpener.js";
import { isWsl } from "../../../server/files/wsl.js";

// `wslpath` exists only on a WSL host, so on the machine running this suite the real
// `toWindowsPath` answers null and the Explorer candidate is skipped before it is ever spawned —
// which is not the branch the WSL test below is about. Only the translation is replaced; `isWsl`
// stays real and is driven by the environment, so the test still exercises the real predicate.
vi.mock("../../../server/files/wsl.js", async (importActual) => {
  const actual = await importActual<typeof import("../../../server/files/wsl.js")>();
  return { ...actual, toWindowsPath: (p: string) => Promise.resolve(`C:\\wsl\\${p}`) };
});

/** A child that reports a start, or a failure to start, once the route has attached its listeners. */
function fakeChild(event: "spawn" | "error", message: string) {
  const child = Object.assign(new EventEmitter(), { unref: () => {} });
  setImmediate(() => child.emit(event, event === "error" ? new Error(message) : undefined));
  return child;
}

interface Call {
  cmd: string;
  args: string[];
}

// Injected for reveal.spec.ts's reason: a real spawn would put a Finder window on the machine
// running the suite, and what is worth asserting is the argv.
function mount(outcome: (n: number) => { event: "spawn" | "error"; message: string }) {
  const calls: Call[] = [];
  let n = 0;
  const spawner = ((cmd: string, args: string[]) => {
    calls.push({ cmd, args });
    const { event, message } = outcome(n++);
    return fakeChild(event, message);
  }) as unknown as Spawner;
  const app = express();
  app.use(express.json());
  mountOpenDirRoute(app, { isAllowedOrigin: () => true, spawner });
  return { request: appRequest(app), calls };
}

let dir: string;
beforeAll(() => {
  dir = makeTempDir("mt-open-dir-");
});

/** Run `body` with the host's platform and WSL environment replaced, so every assertion below means
 *  the same thing on every machine. Forced in BOTH directions deliberately: the WSL case is one no
 *  CI runner can provide, and the non-WSL cases would otherwise see a different candidate list — and
 *  a translated path — on a developer's real WSL box. */
async function onPlatform(platform: NodeJS.Platform, wslDistro: string | undefined, body: () => Promise<void>): Promise<void> {
  const realPlatform = Object.getOwnPropertyDescriptor(process, "platform");
  const realDistro = process.env.WSL_DISTRO_NAME;
  const restoreDistro = (value: string | undefined) => {
    if (value === undefined) delete process.env.WSL_DISTRO_NAME;
    else process.env.WSL_DISTRO_NAME = value;
  };
  Object.defineProperty(process, "platform", { value: platform, configurable: true });
  restoreDistro(wslDistro);
  try {
    await body();
  } finally {
    if (realPlatform) Object.defineProperty(process, "platform", realPlatform);
    restoreDistro(realDistro);
  }
}

const post = (request: ReturnType<typeof appRequest>, body: unknown) =>
  request("/api/open-dir", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

const openers = () => openDirCommands(process.platform, isWsl(process.platform, process.env));

describe("POST /api/open-dir", () => {
  it("hands the directory to the platform's first opener and answers ok", async () => {
    const { request, calls } = mount(() => ({ event: "spawn", message: "" }));
    const res = await post(request, { path: dir });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.cmd).toBe(openers()[0]?.cmd);
  });

  // The directory and nothing else: no `-R`, no `/select,`. That is what separates this route from
  // `reveal`, which has a file to select inside its folder. Pinned to a non-WSL platform so the
  // expected argv is the raw path on every host — under WSL the first opener is a Windows program
  // and is handed the Windows spelling instead, which the fall-through test below covers.
  it("passes the path as the whole argv", async () => {
    await onPlatform("darwin", undefined, async () => {
      const { calls, request } = mount(() => ({ event: "spawn", message: "" }));
      await post(request, { path: dir });
      expect(calls.map((c) => c.cmd)).toEqual(["open"]);
      expect(calls[0]?.args).toEqual([dir]);
    });
  });

  // A wrong WSL guess, or a distro with interop off, must cost a retry and not the feature (#1447).
  //
  // The platform is FORCED rather than read, and that is the whole point: WSL is the only platform
  // with a second candidate to fall through TO, and no CI runner is one. Written as a conditional
  // skip first, this test called `ctx.skip()` on darwin, linux and win32 alike — it asserted
  // nothing, anywhere. Same reasoning as reveal-argv.spec.ts: the interesting branch is always the
  // one the developer's machine cannot run.
  it("falls through to the next opener when the first cannot start (WSL)", async () => {
    await onPlatform("linux", "Ubuntu", async () => {
      // Guard the guard: if this ever stops producing two candidates, the assertions below would
      // pass by spawning once — which is the failure this test exists to catch.
      expect(openers().map((c) => c.cmd)).toEqual(["explorer.exe", "xdg-open"]);
      const { request, calls } = mount((n) => (n === 0 ? { event: "error", message: "no interop" } : { event: "spawn", message: "" }));
      expect((await post(request, { path: dir })).status).toBe(200);
      expect(calls.map((c) => c.cmd)).toEqual(["explorer.exe", "xdg-open"]);
      // Explorer is a Windows program, so it is handed the Windows spelling; xdg-open is not.
      expect(calls[0]?.args).toEqual([`C:\\wsl\\${dir}`]);
      expect(calls[1]?.args).toEqual([dir]);
    });
  });

  // The #1447 regression: it used to answer ok first and log the failure to a console nobody reads,
  // so a host with no opener reported a launch that never happened.
  it("answers 500 naming every attempt when nothing starts", async () => {
    const { request } = mount(() => ({ event: "error", message: "spawn ENOENT" }));
    const res = await post(request, { path: dir });
    expect(res.status).toBe(500);
    const body: unknown = await res.json();
    const error = isRecord(body) ? String(body.error ?? "") : "";
    expect(error).toContain(`could not open ${dir}`);
    openers().forEach((candidate) => expect(error).toContain(`${candidate.cmd}: spawn ENOENT`));
  });

  // `resolveDirRequest` owns WHICH refusal each bad path gets (its own spec pins those); what
  // matters here is that a refused request reaches no opener at all.
  it.each([
    ["a directory that does not exist", () => path.join(dir, "no-such-dir"), 404],
    ["a relative path", () => "./relative", 400],
  ])("spawns nothing for %s", async (_label, target, status) => {
    const { request, calls } = mount(() => ({ event: "spawn", message: "" }));
    const res = await post(request, { path: target() });
    expect(res.status).toBe(status);
    expect(calls).toEqual([]);
  });
});
