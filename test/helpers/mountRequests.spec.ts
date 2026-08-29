// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mountRequests } from "./mountRequests";

// The helper three grid specs mount behind. Its own rules are tested here rather than through
// them: what it accepts, what it records, and — in strict mode — the three ways a mount can
// change without introducing a new url at all (wrong cell, one route missing, one route twice).

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

const get = (url: string) => globalThis.fetch(url);
// The assertion's own values, not its message: vitest truncates the message, so matching on it
// would pass for the wrong url as readily as the right one.
const failure = (run: () => void) => {
  try {
    run();
    return null;
  } catch (e) {
    const { actual, expected } = e as { actual?: unknown; expected?: unknown };
    return JSON.stringify({ actual, expected });
  }
};

describe("mountRequests, open mode", () => {
  const requests = mountRequests(["s1", "s2"]);
  beforeEach(() => requests.install());

  it("answers every listed session's three routes, in the shape their callers read", async () => {
    for (const session of ["s1", "s2"]) {
      expect(await (await get(`/api/question/${session}`)).json()).toEqual({ question: null });
      expect(await (await get(`/api/agent/toolResults/${session}`)).json()).toEqual({ toolResults: [] });
      expect(await (await get(`/api/tools?sessionId=${session}`)).json()).toEqual({ groups: [] });
    }
    expect(failure(requests.settled)).toBeNull();
  });

  it("records anything else, and answers it the way its caller already handles", async () => {
    const res = await get("/api/something-new");
    expect(res.ok).toBe(false);
    expect(failure(requests.settled)).toContain("/api/something-new");
  });

  // The variants that a text pattern used to let through, kept as a list so the next one added
  // has somewhere to go.
  it.each([
    "https://elsewhere.example/api/question/s1",
    "/api/question/s1/answer",
    "/api/question/s1?extra=true",
    "/api/question/s3",
    "/api/tools",
    "/api/tools?sessionId=",
    "/api/tools?sessionId=s1&x=1",
  ])("records %s", async (url) => {
    await get(url);
    expect(failure(requests.settled)).toContain(url);
  });

  // Nothing is pinned to a session here, so a spec that moves the zoom from many places is not
  // made to declare it.
  it("does not mind which session was enlarged", async () => {
    await get("/api/tools?sessionId=s2");
    expect(failure(requests.settled)).toBeNull();
  });
});

describe("mountRequests, strict mode", () => {
  const requests = mountRequests(["s1", "s2"], { strict: true });
  beforeEach(() => requests.install());

  const askAll = async (session: string) => {
    await get(`/api/question/${session}`);
    await get(`/api/agent/toolResults/${session}`);
    await get(`/api/tools?sessionId=${session}`);
  };

  it("accepts the enlarged cell's routes and no others", async () => {
    requests.enlarge("s1");
    await askAll("s1");
    expect(failure(requests.settled)).toBeNull();
  });

  it("records a route for a cell this test never enlarged", async () => {
    requests.enlarge("s1");
    await askAll("s1");
    await get("/api/tools?sessionId=s2");
    expect(failure(requests.settled)).toContain("/api/tools?sessionId=s2");
  });

  // The one a SET could not see: after the zoom moves on, a late request for the cell it left.
  it("records a stale request for the cell the zoom has left", async () => {
    requests.enlarge("s1");
    await askAll("s1");
    requests.enlarge("s2");
    await askAll("s2");
    await get("/api/question/s1");
    expect(failure(requests.settled)).toContain("/api/question/s1");
  });

  it("fails when one of the three routes was never issued", async () => {
    requests.enlarge("s1");
    await get(`/api/question/s1`);
    await get(`/api/agent/toolResults/s1`);
    expect(failure(requests.settled)).toContain("/api/tools?sessionId=s1");
  });

  it("fails when a route is issued twice", async () => {
    requests.enlarge("s1");
    await askAll("s1");
    await get("/api/tools?sessionId=s1");
    expect(failure(requests.settled)).toContain("/api/tools?sessionId=s1");
  });

  // Collapsing the zoom: nothing is enlarged, so nothing may be asked.
  it("expects no request at all while nothing is enlarged", async () => {
    requests.enlarge(null);
    expect(failure(requests.settled)).toBeNull();
    await get("/api/question/s1");
    expect(failure(requests.settled)).toContain("/api/question/s1");
  });

  it("starts each test over", async () => {
    expect(failure(requests.settled)).toBeNull();
  });
});
