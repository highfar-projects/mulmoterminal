// @vitest-environment node
import { describe, it, expect, vi } from "vitest";

import { createServer, type ServerResponse } from "node:http";

import { stopInstances, stopReport, stopExitCode, describeInstance, manualStopCommand, parseStopArgs, confirmInstance } from "../../bin/stop.js";

const instance = (pid: number, port: number | null = 34567) => ({ pid, port, startedAt: 1 });

// The effects are injected, so a whole stop can be observed without a process to kill. `alive` is
// the world: a pid in the set is running, and a kill that "works" takes it out.
const world = (alive: number[], kill?: (pid: number) => void) => {
  const running = new Set(alive);
  return {
    running,
    effects: {
      kill: kill ?? ((pid: number) => running.delete(pid)),
      isAlive: (pid: number) => running.has(pid),
      sleep: async () => {},
      graceMs: 300,
      // Identity is proved separately below; these cases are about the stopping itself.
      confirm: async () => true,
    },
  };
};

const refuse = (code: string) => (pid: number) => {
  const err: NodeJS.ErrnoException = new Error(`kill ${pid}`);
  err.code = code;
  throw err;
};

describe("stopInstances", () => {
  it("stops every running server, not just the first", async () => {
    const { effects } = world([11, 22]);
    const result = await stopInstances([instance(11, 34567), instance(22, 34568)], effects);
    expect(result.stopped.map((i) => i.pid)).toEqual([11, 22]);
    expect(result.stubborn).toEqual([]);
  });

  it("treats a server that ended on its own as nothing to report", async () => {
    // ESRCH is the registry being a moment stale — the user asked for it to be stopped and it is.
    const { effects } = world([], refuse("ESRCH"));
    const result = await stopInstances([instance(11)], effects);
    expect(result.stopped).toEqual([]);
    expect(result.stubborn).toEqual([]);
  });

  it("reports a server it is not allowed to stop, rather than claiming success", async () => {
    const { effects } = world([11], refuse("EPERM"));
    const result = await stopInstances([instance(11)], effects);
    expect(result.stopped).toEqual([]);
    expect(result.stubborn).toEqual([{ pid: 11, port: 34567, startedAt: 1, reason: "EPERM" }]);
  });

  it("gives up on a server that outlives the grace period, and says which", async () => {
    const { effects } = world([11]);
    const result = await stopInstances([instance(11)], { ...effects, kill: () => {} });
    expect(result.stopped).toEqual([]);
    expect(result.stubborn.map((i) => i.reason)).toEqual(["still running"]);
  });

  it("waits for a slow shutdown instead of calling it stubborn", async () => {
    // The window exists because SIGTERM runs the same shutdown Ctrl+C runs, which is not instant.
    const { running, effects } = world([11]);
    let polls = 0;
    const result = await stopInstances([instance(11)], {
      ...effects,
      kill: () => {},
      isAlive: (pid: number) => {
        if (++polls > 2) running.delete(pid);
        return running.has(pid);
      },
    });
    expect(result.stopped.map((i) => i.pid)).toEqual([11]);
  });

  it("asks them all before waiting on any, so one slow server does not delay the rest", async () => {
    const order: string[] = [];
    const { effects } = world([11, 22]);
    await stopInstances([instance(11), instance(22)], {
      ...effects,
      kill: (pid: number) => order.push(`kill:${pid}`),
      isAlive: () => {
        order.push("poll");
        return false;
      },
    });
    expect(order.indexOf("kill:22")).toBeLessThan(order.indexOf("poll"));
  });

  it("sends SIGTERM by default — the signal the server has a handler for", async () => {
    const kill = vi.spyOn(process, "kill").mockImplementation(() => true);
    // force, so this stays about the SIGNAL and does not depend on a server answering.
    await stopInstances([instance(11)], { isAlive: () => false, sleep: async () => {}, graceMs: 0, force: true });
    expect(kill).toHaveBeenCalledWith(11, "SIGTERM");
    kill.mockRestore();
  });
});

describe("stopReport", () => {
  it("says so plainly when nothing was running", () => {
    expect(stopReport({ stopped: [], stubborn: [], unconfirmed: [] })).toEqual(["MulmoTerminal is not running."]);
  });

  it("names each server by the URL the user has open", () => {
    expect(stopReport({ stopped: [instance(11, 34567)], stubborn: [], unconfirmed: [] })).toEqual(["Stopped http://localhost:34567 (pid 11)"]);
  });

  it("hands over the pid when it could not stop one, because the registry is no longer readable to the user", () => {
    // The platform is named, because the command is not the same on all of them and this case is
    // about HANDING OVER THE PID — which one it names is pinned by the manualStopCommand suite.
    // Left to default, this assertion passes on the machine that wrote it and fails on the Windows
    // runner, which is what it did.
    const lines = stopReport({ stopped: [], stubborn: [{ ...instance(11), reason: "EPERM" }], unconfirmed: [] }, "darwin");
    expect(lines.join("\n")).toContain("Could NOT stop");
    expect(lines.join("\n")).toContain("kill -9 11");
  });

  it("falls back to the pid for an instance that never recorded a port", () => {
    expect(describeInstance(instance(11, null))).toBe("pid 11");
  });
});

describe("stopExitCode", () => {
  it("succeeds when there was nothing to stop, so a script can run it before starting", () => {
    expect(stopExitCode({ stopped: [], stubborn: [], unconfirmed: [] })).toBe(0);
  });

  it("fails only when something was asked to stop and did not", () => {
    expect(stopExitCode({ stopped: [instance(11)], stubborn: [], unconfirmed: [] })).toBe(0);
    expect(stopExitCode({ stopped: [], stubborn: [{ ...instance(11), reason: "EPERM" }], unconfirmed: [] })).toBe(1);
  });
});

// A LIVE PID IS NOT AN IDENTITY (CodeRabbit, Codex). A server killed outright leaves its registry
// file behind, and the OS may hand that pid to something else — at which point signalling it would
// SIGTERM a stranger's process. The old reader of this registry only ever asked "is one running?",
// which was harmless; stopping is not.
describe("stopInstances identity check", () => {
  const alive = { isAlive: () => false, sleep: async () => {}, graceMs: 0 };

  it("does not signal a pid it cannot corroborate", async () => {
    const kill = vi.fn();
    const result = await stopInstances([instance(11)], { ...alive, kill, confirm: async () => false });
    expect(kill).not.toHaveBeenCalled();
    expect(result.unconfirmed.map((i) => i.pid)).toEqual([11]);
    expect(result.stopped).toEqual([]);
  });

  it("signals one it can", async () => {
    const kill = vi.fn();
    const result = await stopInstances([instance(11)], { ...alive, kill, confirm: async () => true });
    expect(kill).toHaveBeenCalledWith(11);
    expect(result.stopped.map((i) => i.pid)).toEqual([11]);
  });

  it("stops asking once --force is given, which is the way out for a server that has hung", async () => {
    const kill = vi.fn();
    const confirm = vi.fn(async () => false);
    await stopInstances([instance(11)], { ...alive, kill, confirm, force: true });
    expect(confirm).not.toHaveBeenCalled();
    expect(kill).toHaveBeenCalledWith(11);
  });

  it("judges each instance on its own, so one unconfirmed entry cannot spare the others", async () => {
    const kill = vi.fn();
    const result = await stopInstances([instance(11, 34567), instance(22, 34568)], {
      ...alive,
      kill,
      confirm: async (i) => i.pid === 22,
    });
    expect(kill.mock.calls).toEqual([[22]]);
    expect(result.unconfirmed.map((i) => i.pid)).toEqual([11]);
  });
});

describe("the report when something was left alone", () => {
  const left = { stopped: [], stubborn: [], unconfirmed: [instance(11)] };

  it("says why, rather than reporting it as stopped", () => {
    const text = stopReport(left, "darwin").join("\n");
    expect(text).toContain("could not confirm");
    expect(text).toContain("--force");
    expect(text).not.toContain("Stopped http");
  });

  it("names a --force command the reader can actually run", () => {
    // An npx user has no global `mulmoterminal`, so a hardcoded one would send them to a command
    // that does not exist — the same defect the already-running prompt was fixed for (Codex).
    expect(stopReport(left, "darwin", "npx mulmoterminal@latest stop").join("\n")).toContain("npx mulmoterminal@latest stop --force");
    expect(stopReport(left, "darwin", "mulmoterminal stop").join("\n")).toContain("mulmoterminal stop --force");
  });

  it("is a failure, because it is not what the user asked for", () => {
    expect(stopExitCode(left)).toBe(1);
  });
});

// `kill -9` is not a command in a standard Windows shell — and a Windows report is why this whole
// feature exists, so printing something unusable there would be the same failure again.
describe("manualStopCommand", () => {
  it("gives a Windows user a command Windows has", () => {
    expect(manualStopCommand([11], "win32")).toBe("taskkill /PID 11 /F");
    expect(manualStopCommand([11, 22], "win32")).toBe("taskkill /PID 11 /F && taskkill /PID 22 /F");
  });

  it("keeps the POSIX one everywhere else", () => {
    expect(manualStopCommand([11, 22], "darwin")).toBe("kill -9 11 22");
    expect(manualStopCommand([11], "linux")).toBe("kill -9 11");
  });

  it("is what the report reaches for on each platform", () => {
    const result = { stopped: [], stubborn: [{ ...instance(11), reason: "EPERM" }], unconfirmed: [] };
    expect(stopReport(result, "win32").join("\n")).toContain("taskkill /PID 11 /F");
    expect(stopReport(result, "linux").join("\n")).toContain("kill -9 11");
  });
});

// `stop` ignoring its arguments meant `stop --help` SIGTERMed every server instead of printing
// help (CodeRabbit) — the worst possible reading of a request for information.
describe("parseStopArgs", () => {
  it("treats --help as a request for help, not as a request to stop everything", () => {
    expect(parseStopArgs(["--help"])).toEqual({ help: true });
    expect(parseStopArgs(["-h"])).toEqual({ help: true });
  });

  it("accepts --force", () => {
    expect(parseStopArgs(["--force"])).toEqual({ force: true });
    expect(parseStopArgs([])).toEqual({ force: false });
  });

  it("refuses what it does not understand rather than stopping servers anyway", () => {
    expect(parseStopArgs(["--all"])).toMatchObject({ error: expect.stringContaining("--all") });
    expect(parseStopArgs(["34567"])).toMatchObject({ error: expect.stringContaining("34567") });
  });
});

// The identity probe itself, against a real loopback server — because what it must reject is a
// PORT THAT ANSWERS, and a mocked `get` would prove nothing about that (Codex's second pass:
// "a generic HTTP response does not prove that the recorded PID belongs to that instance").
describe("confirmInstance against a real server", () => {
  const serve = async (handler: (req: unknown, res: ServerResponse) => void): Promise<{ port: number; close: () => void }> => {
    const server = createServer((req, res) => handler(req, res));
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const addr = server.address();
    if (addr === null || typeof addr === "string") throw new Error("no port");
    return { port: addr.port, close: () => server.close() };
  };

  const json = (body: unknown) => (_req: unknown, res: ServerResponse) => {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify(body));
  };

  it("accepts a server that reports the pid the registry recorded", async () => {
    const s = await serve(json({ pid: 4242 }));
    try {
      expect(await confirmInstance({ pid: 4242, port: s.port, startedAt: 1 })).toBe(true);
    } finally {
      s.close();
    }
  });

  it("REJECTS a server on that port reporting a different pid", async () => {
    // The case a mere reachability probe got wrong: crashed, restarted on the same port, old pid
    // reused by something unrelated. The port answers; it is still not that pid.
    const s = await serve(json({ pid: 9999 }));
    try {
      expect(await confirmInstance({ pid: 4242, port: s.port, startedAt: 1 })).toBe(false);
    } finally {
      s.close();
    }
  });

  it("rejects something that is not MulmoTerminal at all", async () => {
    const s = await serve((_req, res) => {
      res.writeHead(200, { "content-type": "text/html" });
      res.end("<html>some other server</html>");
    });
    try {
      expect(await confirmInstance({ pid: 4242, port: s.port, startedAt: 1 })).toBe(false);
    } finally {
      s.close();
    }
  });

  it("rejects an error status", async () => {
    const s = await serve((_req, res) => {
      res.writeHead(404);
      res.end("nope");
    });
    try {
      expect(await confirmInstance({ pid: 4242, port: s.port, startedAt: 1 })).toBe(false);
    } finally {
      s.close();
    }
  });

  it("rejects a port nothing is listening on", async () => {
    const s = await serve(json({ pid: 4242 }));
    const port = s.port;
    s.close();
    await new Promise((r) => setTimeout(r, 50));
    expect(await confirmInstance({ pid: 4242, port, startedAt: 1 })).toBe(false);
  });

  it("rejects an entry that never recorded a port, without opening a socket", async () => {
    expect(await confirmInstance({ pid: 4242, port: null, startedAt: 1 })).toBe(false);
  });
});
