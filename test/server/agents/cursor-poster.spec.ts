// @vitest-environment node
// The generated poster, RUN rather than read.
//
// It is a string this repo emits into the user's home and cursor executes on every turn, so the
// only honest test is to execute it. What it has to get right is the case round 16 of #2065 found:
// a hook file OUTLIVES the server that wrote it — a crash skips the exit handler, and a user who
// edits the file makes it one MulmoTerminal may no longer rewrite or remove — so a stranded
// command must be HARMLESS rather than merely unlucky. Without the registry check it posts every
// prompt and tool argument to a bare local port that by then may belong to something else.
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { execFileSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { cursorPosterSource } from "../../../server/agents/cursor-hooks-file.js";

let dir: string;
let instances: string;
let poster: string;
let server: Server;
let port: number;
let received: string[];

beforeEach(async () => {
  dir = mkdtempSync(path.join(os.tmpdir(), "cursor-poster-"));
  instances = path.join(dir, "instances");
  mkdirSync(instances, { recursive: true });
  poster = path.join(dir, "cursor-hook.mjs");
  writeFileSync(poster, cursorPosterSource(instances), "utf8");
  received = [];
  server = createServer((req, res) => {
    received.push(String(req.headers["x-mt-hook"]));
    req.resume();
    res.writeHead(200, { "content-type": "application/json" });
    res.end("{}");
  });
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  const address = server.address();
  port = typeof address === "object" && address !== null ? address.port : 0;
});

afterEach(async () => {
  await new Promise<void>((done) => server.close(() => done()));
  rmSync(dir, { recursive: true, force: true });
});

/** Run the poster exactly as cursor would, and give the request a moment to land. */
const post = async (): Promise<void> => {
  const out = execFileSync(process.execPath, [poster, "stop", String(port)], { input: '{"conversation_id":"x"}', encoding: "utf8" });
  // Cursor reads stdout as the hook's answer; `{}` is "no opinion", and it must be there whether or
  // not the post happened.
  expect(out).toBe("{}");
  await new Promise((done) => setTimeout(done, 250));
};

const registerInstance = (pid: number, onPort: number): void =>
  writeFileSync(path.join(instances, `${pid}.json`), JSON.stringify({ pid, port: onPort, startedAt: Date.now() }), "utf8");

describe("the generated cursor poster", () => {
  it("posts when a LIVE instance serves that port", async () => {
    registerInstance(process.pid, port); // this test process is alive by definition
    await post();
    expect(received).toEqual(["stop"]);
  });

  it("posts NOTHING when the registry names no instance on that port", async () => {
    registerInstance(process.pid, port + 1);
    await post();
    expect(received).toEqual([]);
  });

  it("posts NOTHING when the instance on that port is dead", async () => {
    // A pid that cannot be running: `process.kill(pid, 0)` throws ESRCH for it.
    registerInstance(0x7ffffffe, port);
    await post();
    expect(received).toEqual([]);
  });

  it("fails OPEN when there is no registry at all", async () => {
    // A machine where it was never writable keeps the status it has today, rather than losing it
    // to a check that cannot be answered.
    rmSync(instances, { recursive: true, force: true });
    await post();
    expect(received).toEqual(["stop"]);
  });
});
