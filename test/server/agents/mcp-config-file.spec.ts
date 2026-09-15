// @vitest-environment node
//
// The rules agy and cursor now share. Their own specs pin what an ENTRY looks like; this one pins
// the half neither of them owns any more, over generated keys rather than the handful a hand-written
// case would think of — which is the point, because the keys that break this are the ones nobody
// types (`__proto__` arrives only out of `JSON.parse`, never out of an object literal).
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { TOOL_GROUPS, toolGroupServerId, type ToolGroup } from "../../../common/toolGroups.js";
import { OUR_GUI_SERVER_IDS } from "../../../server/agents/gui-mcp-bridge.js";
import { mergeOurMcpServers, readMcpServers } from "../../../server/agents/mcp-config-file.js";

const entry = (group: ToolGroup) => ({ command: "node", args: ["--group", group] });

// Keys a user's file can really carry. The first six are the ones that resolve through
// Object.prototype if a merge uses `merged[id] = …`; the rest are ordinary.
const HOSTILE_KEYS = ["__proto__", "constructor", "prototype", "toString", "hasOwnProperty", "valueOf"];
const PLAIN_KEYS = ["their-server", "z-last", "A-first", "a b", "0"];
const USER_KEYS = [...HOSTILE_KEYS, ...PLAIN_KEYS];

// Built the way a real one is — parsed from text — so `__proto__` is an OWN property here too.
const userFile = (keys: readonly string[]): Record<string, unknown> => {
  const fields = keys.map((key, i) => `${JSON.stringify(key)}:{"mine":${i}}`);
  return JSON.parse(`{${fields.join(",")}}`);
};

describe("mergeOurMcpServers", () => {
  it("keeps every entry the user owns, whatever the key is", () => {
    const merged = mergeOurMcpServers(userFile(USER_KEYS), [], entry);
    USER_KEYS.forEach((key, i) => {
      expect(Object.prototype.hasOwnProperty.call(merged, key), `${key} survived as an own property`).toBe(true);
      expect(Object.getOwnPropertyDescriptor(merged, key)?.value).toEqual({ mine: i });
    });
  });

  it("writes exactly the groups given, through the caller's own entry shape", () => {
    const merged = mergeOurMcpServers({}, TOOL_GROUPS, entry);
    expect(Object.keys(merged)).toEqual(TOOL_GROUPS.map(toolGroupServerId));
    TOOL_GROUPS.forEach((group) => expect(merged[toolGroupServerId(group)]).toEqual(entry(group)));
  });

  // A group switched OFF must leave no entry behind — the file is rewritten, not added to.
  it("drops every id of ours that is not in this call's groups", () => {
    const stale = Object.fromEntries([...OUR_GUI_SERVER_IDS].map((id) => [id, { stale: true }]));
    const kept = [TOOL_GROUPS[0]];
    const merged = mergeOurMcpServers({ ...stale, mine: { keep: true } }, kept, entry);
    expect(Object.keys(merged)).toEqual(["mine", toolGroupServerId(TOOL_GROUPS[0])]);
  });

  // Insertion order, with one caveat that is JavaScript's and not ours: an integer-like key such as
  // "0" is enumerated FIRST whatever order it was set in, so the named keys here avoid one.
  it("puts the user's entries first, in their own order, then ours in group order", () => {
    const named = PLAIN_KEYS.filter((key) => !/^\d+$/.test(key));
    const groups = [...TOOL_GROUPS].reverse();
    const merged = mergeOurMcpServers(userFile(named), groups, entry);
    expect(Object.keys(merged)).toEqual([...named, ...groups.map(toolGroupServerId)]);
  });

  it("does not mutate the map it was given", () => {
    const existing = userFile(PLAIN_KEYS);
    const before = JSON.stringify(existing);
    mergeOurMcpServers(existing, TOOL_GROUPS, entry);
    expect(JSON.stringify(existing)).toBe(before);
  });
});

describe("readMcpServers", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mcp-config-file-"));
  let seq = 0;
  // A fresh name per call so one case cannot read another's file.
  const withBody = (body: string): Record<string, unknown> | null => {
    const file = path.join(dir, `f${seq++}.json`);
    fs.writeFileSync(file, body, "utf8");
    return readMcpServers(file);
  };

  it("reads no file as an empty map — there is nothing of the user's to lose", () => {
    expect(readMcpServers(path.join(dir, "absent.json"))).toEqual({});
  });

  // `null` is the refusal: the caller must leave the file alone rather than rewrite it.
  it.each([
    ["not JSON at all", "{"],
    ["an empty file", ""],
    ["a JSON array", "[]"],
    ["a JSON scalar", "3"],
    ["JSON null", "null"],
  ])("refuses %s, so the caller leaves it alone", (_label, body) => {
    expect(withBody(body)).toBeNull();
  });

  it.each([
    ["no mcpServers key", "{}"],
    ["mcpServers that is not an object", '{"mcpServers":[]}'],
    ["mcpServers that is null", '{"mcpServers":null}'],
  ])("reads %s as an empty map", (_label, body) => {
    expect(withBody(body)).toEqual({});
  });

  // The OUTCOME, not the mechanism. `readMcpServers` guards the lookup with `hasOwnProperty`, and
  // nothing here can tell that apart from a plain `in`: `JSON.parse` hands back an object whose
  // prototype is always Object.prototype and puts `__proto__` on it as an OWN key, so an INHERITED
  // `mcpServers` cannot arrive out of a file. What is worth pinning is that a payload shaped like
  // this one does not become the user's server map.
  it("does not mistake an attacker's `__proto__` payload for the server map", () => {
    expect(withBody('{"__proto__":{"mcpServers":{"inherited":1}}}')).toEqual({});
  });

  it("carries the user's own `__proto__` entry through as an own property", () => {
    const servers = withBody('{"mcpServers":{"__proto__":{"command":"theirs"},"mine":{"command":"x"}}}');
    expect(Object.prototype.hasOwnProperty.call(servers ?? {}, "__proto__")).toBe(true);
  });
});
