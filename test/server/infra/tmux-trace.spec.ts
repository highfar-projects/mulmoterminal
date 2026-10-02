// @vitest-environment node
import { mkdtempSync, readFileSync, rmSync, existsSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { callerFrames, traceLine, traceTmux, tmuxTraceFile } from "../../../server/infra/tmux-trace.js";

describe("traceLine", () => {
  it("writes one JSON object per line: time, pid, event, then the fields", () => {
    const line = traceLine("kill-session", { id: "abc", ok: true }, new Date("2026-10-02T00:15:31.000Z"), 42);
    expect(line.endsWith("\n")).toBe(true);
    expect(JSON.parse(line)).toEqual({ t: "2026-10-02T00:15:31.000Z", pid: 42, event: "kill-session", id: "abc", ok: true });
  });
});

describe("callerFrames", () => {
  // The traced function's own frame is skipped, so the first one left is the code that asked.
  it("names the callers, not the traced function, the trace module or Node's internals", () => {
    const stack = [
      "Error",
      "    at tmuxKillSession (D:/app/server/infra/tmux.ts:377:3)",
      "    at reap (D:/app/server/session/lifecycle.ts:205:5)",
      "    at handlePtyExit (D:/app/server/session/pty-exit.ts:55:5)",
      "    at writeLine (D:/app/server/infra/tmux-trace.ts:40:1)",
      "    at process.processTicksAndRejections (node:internal/process/task_queues:95:5)",
    ].join("\n");
    expect(callerFrames(stack)).toEqual(["reap (D:/app/server/session/lifecycle.ts:205:5)", "handlePtyExit (D:/app/server/session/pty-exit.ts:55:5)"]);
  });

  it("answers nothing for a missing stack", () => {
    expect(callerFrames(undefined)).toEqual([]);
  });
});

describe("traceTmux", () => {
  let dir = "";
  beforeEach(() => {
    dir = mkdtempSync(path.join(os.tmpdir(), "mt-tmux-trace-"));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it("lives under ~/.mulmoterminal", () => {
    expect(tmuxTraceFile("/h")).toBe(path.join("/h", ".mulmoterminal", "tmux-trace.jsonl"));
  });

  // Real tmux hosts get nothing new on disk.
  it("writes nothing when disabled", () => {
    const file = path.join(dir, "trace.jsonl");
    traceTmux(false, "client-exit", { id: "a" }, file);
    expect(existsSync(file)).toBe(false);
  });

  it("appends one line per event when enabled", () => {
    const file = path.join(dir, "nested", "trace.jsonl");
    traceTmux(true, "client-spawn", { id: "a", reattach: true }, file);
    traceTmux(true, "client-exit", { id: "a", disposition: "keep" }, file);
    const events = readFileSync(file, "utf8")
      .trim()
      .split("\n")
      .map((line) => (JSON.parse(line) as { event: string }).event);
    expect(events).toEqual(["client-spawn", "client-exit"]);
  });

  it("moves a full file aside and starts again", () => {
    const file = path.join(dir, "trace.jsonl");
    writeFileSync(file, "x".repeat(1024 * 1024 + 1));
    traceTmux(true, "server-start", {}, file);
    expect(existsSync(`${file}.1`)).toBe(true);
    expect(readFileSync(file, "utf8").split("\n").filter(Boolean)).toHaveLength(1);
  });
});
