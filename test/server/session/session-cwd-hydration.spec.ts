// @vitest-environment node
//
// That `cwdForSessionHydrated` really WAITS for the remembered directories to be read off disk
// (#2133).
//
// The map behind `cwdForSession` is filled by a floating promise started when the registry module
// evaluates; nothing awaits it there. So a session route that read the map directly would, for the
// first moments after boot, be told the workspace — which is exactly the default the route passes
// a session's own directory to replace, and the poll behind it repeats every few seconds, so the
// wrong answer is the one the user sees first. Every other reader of that map waits the same way
// (`ws-routes`, `surviving-sessions`); this pins that this one does too.
//
// THE MEASUREMENT HAPPENS AT MODULE SCOPE because that is the only placement with a REASON behind
// it. Filling the map needs a COMPLETED file read — a macrotask — and only microtasks run between
// a module finishing evaluation and its importer resuming, so from here the map is deterministically
// still empty.
//
// It is NOT kept here because the alternative fails. Measured on both sides: with the await
// removed this spec goes red from module scope, and it goes red with either capture moved into a
// test body as well. That placement happens to work; nothing guarantees it, because a test body
// runs an unknown number of macrotasks after the import — a race this suite currently wins rather
// than one it cannot lose. The route-level spec is where the same race is already lost: a full
// request cycle gives the read all the time it needs, which is why mutating the await against it
// stays green, and why this file exists at all.
import { describe, it, expect, afterAll } from "vitest";
import { promises as fs } from "node:fs";
import path from "node:path";
import { takeScratchHome } from "../../support/scratchHome.js";

const SESSION = "5e0c1a52-8c41-4b77-9f0e-21336c0a9e7b";

// HOME moves before the import: CLAUDE_CWD and MULMOTERMINAL_HOME are both computed from it at
// import time, and the log below has to be in place before the registry starts reading it.
const scratchHome = takeScratchHome("mt-session-cwd-hydration-");
const REMEMBERED_CWD = path.join(scratchHome.path, "a-project");
await fs.mkdir(path.join(scratchHome.path, ".mulmoterminal"), { recursive: true });
await fs.writeFile(path.join(scratchHome.path, ".mulmoterminal", "dev-terminal-cwds.json"), `${SESSION} ${REMEMBERED_CWD}\n`);

const { cwdForSession, cwdForSessionHydrated } = await import("../../../server/session/session-cwd.js");
const { CLAUDE_CWD } = await import("../../../server/config/env.js");

const onTheImportTick = cwdForSession(SESSION);
const afterAwaiting = await cwdForSessionHydrated(SESSION);

afterAll(() => scratchHome.release());

describe("cwdForSessionHydrated", () => {
  // The PREMISE, asserted rather than assumed: without this, the test below could be green because
  // the await works or because there was never anything to wait for, and those look identical.
  it("has nothing remembered yet on the tick the import returns", () => {
    expect(onTheImportTick).toBe(CLAUDE_CWD);
  });

  it("answers the session's remembered directory once hydration has settled", () => {
    expect(afterAwaiting).toBe(REMEMBERED_CWD);
  });
});
