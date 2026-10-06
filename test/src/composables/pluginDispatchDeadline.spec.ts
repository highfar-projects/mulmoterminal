import { describe, it, expect } from "vitest";

import { PLUGIN_DISPATCH_TIMEOUT_MS, pluginDispatchError } from "../../../src/composables/pluginDispatchDeadline";
import { SLOW_COMMAND_TIMEOUT_MS } from "../../../src/utils/fetchWithTimeout";

const HOUR_MS = 60 * 60_000;

describe("PLUGIN_DISPATCH_TIMEOUT_MS", () => {
  it("outlasts the deadline that cut a movie off at a minute", () => {
    expect(PLUGIN_DISPATCH_TIMEOUT_MS).toBeGreaterThan(SLOW_COMMAND_TIMEOUT_MS);
    expect(PLUGIN_DISPATCH_TIMEOUT_MS).toBe(HOUR_MS);
  });
});

describe("pluginDispatchError", () => {
  it("turns the browser's deadline abort into a timeout that says the work may still finish", () => {
    const abort = new DOMException("signal is aborted without reason", "AbortError");
    const out = pluginDispatchError("presentMulmoScript", abort, HOUR_MS);
    expect(out).toBeInstanceOf(Error);
    expect(String(out)).toContain("plugin/presentMulmoScript gave no answer within 60 minutes");
    expect(String(out)).toContain("may still be running on the server");
    expect(String(out)).not.toContain("aborted without reason");
    expect(out instanceof Error ? out.cause : undefined).toBe(abort);
  });

  it("recognises any thrown value named AbortError, not only a DOMException", () => {
    const out = pluginDispatchError("t", { name: "AbortError", message: "x" }, HOUR_MS);
    expect(String(out)).toContain("gave no answer within 60 minutes");
  });

  it("states the deadline it was given, in whole minutes", () => {
    expect(String(pluginDispatchError("t", new DOMException("", "AbortError"), 90_000))).toContain("within 2 minutes");
  });

  it("passes a network failure through unchanged", () => {
    const err = new TypeError("Failed to fetch");
    expect(pluginDispatchError("t", err, HOUR_MS)).toBe(err);
  });

  it("passes the route's own failure through unchanged", () => {
    const err = new Error("plugin/t dispatch failed (500): boom");
    expect(pluginDispatchError("t", err, HOUR_MS)).toBe(err);
  });

  it("passes a DOMException that is not an abort through unchanged", () => {
    const err = new DOMException("nope", "TimeoutError");
    expect(pluginDispatchError("t", err, HOUR_MS)).toBe(err);
  });

  it.each([null, undefined, "AbortError", 0, { name: "Abort" }])("passes %p through unchanged", (value) => {
    expect(pluginDispatchError("t", value, HOUR_MS)).toBe(value);
  });
});
