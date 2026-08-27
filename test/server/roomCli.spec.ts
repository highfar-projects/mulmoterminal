// @vitest-environment node
// The CLI's argument parsing, on its own — because the argument being parsed is a MESSAGE somebody
// is posting, and a parser that treats every `--token` as a flag silently eats part of it
// (Codex review on #1456). `bin/*.js` is plain JS with no other coverage, so this is where it gets
// pinned.
import { describe, it, expect, vi, afterEach } from "vitest";

const { positionalForTest, flagForTest, portForTest, runRoom } = await import("../../bin/room.js");

describe("room CLI arguments", () => {
  it("keeps the whole message, including words that look like flags", () => {
    const args = ["post", "standup", "use", "--force", "carefully"];
    expect(positionalForTest(args)).toEqual(["post", "standup", "use", "--force", "carefully"]);
  });

  it("still consumes the flags it does know, and their values", () => {
    const args = ["post", "standup", "hello", "--port", "34599", "--from", "ci"];
    expect(positionalForTest(args)).toEqual(["post", "standup", "hello"]);
    expect(flagForTest(args, "--from")).toBe("ci");
  });

  // A message that really does begin with a known flag still has to be postable.
  it("stops parsing flags at `--`", () => {
    expect(positionalForTest(["post", "standup", "--", "--port", "is", "the", "topic"])).toEqual(["post", "standup", "--port", "is", "the", "topic"]);
  });

  it("does not treat an unknown flag as taking a value", () => {
    expect(positionalForTest(["post", "r", "--wat", "keep-me"])).toEqual(["post", "r", "--wat", "keep-me"]);
  });

  // `--` has to mean the same thing to EVERY reader. It kept the message text intact while
  // `--from` and `--port` were still picked up from inside it, so a message that discussed a flag
  // silently changed who the post came from (Codex review on #1456).
  it("keeps a flag after `--` out of the flag readers, not just out of the text", () => {
    const args = ["post", "standup", "--", "ask", "about", "--from", "ci"];
    expect(positionalForTest(args)).toEqual(["post", "standup", "ask", "about", "--from", "ci"]);
    expect(flagForTest(args, "--from")).toBeUndefined();
  });

  it("keeps a port after `--` from redirecting the request", () => {
    expect(portForTest(["post", "r", "--", "try", "--port", "9999"])).not.toBe(9999);
    expect(portForTest(["post", "r", "--port", "34599", "hello"])).toBe(34599);
  });

  // Run INSIDE a cell, `room` has to reach the server that owns the cell. It used to find it
  // through the raw `PORT` the launcher gave every PTY — the leak #1857 is about, now gone — so
  // the namespaced name every terminal gets (server/session/pty-spawn.ts) has to be preferred.
  // Without this, `room` in a cell of a server on 34601 talks to whatever holds 34567.
  describe("which server it talks to", () => {
    const saved = { mt: process.env.MULMOTERMINAL_PORT, port: process.env.PORT };
    const set = (mt?: string, port?: string) => {
      if (mt === undefined) delete process.env.MULMOTERMINAL_PORT;
      else process.env.MULMOTERMINAL_PORT = mt;
      if (port === undefined) delete process.env.PORT;
      else process.env.PORT = port;
    };
    afterEach(() => set(saved.mt, saved.port));

    it("prefers MULMOTERMINAL_PORT, which is what a cell is given", () => {
      set("34601", undefined);
      expect(portForTest(["list"])).toBe(34601);
    });

    // A user's own PORT is not this server's port; ours wins where both are present.
    it("prefers MULMOTERMINAL_PORT over a PORT the user exported for something else", () => {
      set("34601", "3000");
      expect(portForTest(["list"])).toBe(34601);
    });

    // Kept behind it for someone running `room` in their own shell against a server they moved
    // with PORT=<n> — the same variable the launcher now reads (#1861).
    it("falls back to PORT outside a cell", () => {
      set(undefined, "34602");
      expect(portForTest(["list"])).toBe(34602);
    });

    it("--port still beats both", () => {
      set("34601", "3000");
      expect(portForTest(["list", "--port", "34603"])).toBe(34603);
    });

    it("falls back to the default when neither is set", () => {
      set(undefined, undefined);
      expect(portForTest(["list"])).toBe(34567);
    });
  });
});

// What the parser decides is only half of it — CodeRabbit asked for the REQUEST. This asserts the
// URL and the JSON body the CLI actually sends, which is what a user is affected by (#1456).
describe("room post — what is actually sent", () => {
  const sent: { url: string; body: unknown }[] = [];
  const stubFetch = () => {
    globalThis.fetch = vi.fn(async (url: string, init?: { body?: string }) => {
      sent.push({ url: String(url), body: init?.body ? JSON.parse(init.body) : null });
      return { ok: true, json: async () => ({ ok: true }) };
    }) as unknown as typeof fetch;
  };
  afterEach(() => {
    sent.length = 0;
    vi.restoreAllMocks();
  });

  it("posts the message and the flags the user meant", async () => {
    stubFetch();
    await runRoom(["post", "standup", "hello", "there", "--from", "ci", "--port", "34599"]);
    expect(sent[0]?.url).toBe("http://localhost:34599/api/rooms/standup");
    expect(sent[0]?.body).toEqual({ from: "ci", text: "hello there" });
  });

  // The whole point of `--`: everything after it is the message, and nothing after it may change
  // who the post is from or where it goes.
  it("keeps flags after `--` inside the message, not in the request", async () => {
    stubFetch();
    await runRoom(["post", "standup", "--from", "ci", "--", "should", "we", "use", "--port", "9999"]);
    expect(sent[0]?.url).toBe("http://localhost:34567/api/rooms/standup"); // not 9999
    expect(sent[0]?.body).toEqual({ from: "ci", text: "should we use --port 9999" });
  });
});
