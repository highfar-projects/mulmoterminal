// The requests TerminalGrid makes just by being mounted on an enlarged session, answered so a
// spec that is about something else does not reach the network.
//
// Three of them, all from watchers that run immediately: is a question open, does this session
// already have a canvas card, and what can it draw. None of the specs using this cares about the
// answers — but unmocked they go out for real, and every caller catches its own failure, so the
// miss leaves nothing to notice. That is how three spec files acquired it without anyone seeing.
//
// Shared rather than copied: the list is the same for every spec that mounts the grid, and three
// copies would drift the moment a fourth request is added.
import { expect, vi } from "vitest";

/** The routes a mount issues, per session, in the shape their callers read. */
const routesFor = (session: string): [string, () => unknown][] => [
  [`/api/question/${encodeURIComponent(session)}`, () => ({ question: null })],
  [`/api/agent/toolResults/${encodeURIComponent(session)}`, () => ({ toolResults: [] })],
  [`/api/tools?sessionId=${encodeURIComponent(session)}`, () => ({ groups: [] })],
];

export interface MountRequests {
  /** Install the mock. Call from `beforeEach`: assigning at module scope does not take. */
  install: () => void;
  /** Say which session the zoom has moved to — `strict` mode only. */
  enlarge: (session: string | null) => void;
  /** Assert from `afterEach`, after `flushPromises()`. */
  settled: () => void;
}

/**
 * `sessions` are every session id the spec's cells can have.
 *
 * `strict` additionally pins WHICH session may be asked about and HOW OFTEN: a route is answered
 * only for the currently enlarged cell, and every route that cell should have produced must have
 * been issued exactly once. It costs the spec an `enlarge()` at each point the zoom moves, so it
 * is opt-in — a spec whose tests move the zoom from many places gets the network closed off
 * without being restructured around bookkeeping it is not about.
 */
export function mountRequests(sessions: readonly string[], { strict = false } = {}): MountRequests {
  const allowed = new Map<string, { session: string; body: () => unknown }>(
    sessions.flatMap((session) => routesFor(session).map(([url, body]): [string, { session: string; body: () => unknown }] => [url, { session, body }])),
  );
  const unexpected: string[] = [];
  const asked: string[] = [];
  const enlarged = new Set<string>();
  let current: string | null = null;

  const answerable = (route: { session: string }) => !strict || route.session === current;

  return {
    install() {
      unexpected.length = 0;
      asked.length = 0;
      enlarged.clear();
      current = null;
      // `Parameters<typeof fetch>[0]` rather than `RequestInfo`: this helper is reached from the
      // node-lib test project too, where the DOM lib's alias does not exist.
      globalThis.fetch = vi.fn(async (input: Parameters<typeof fetch>[0]) => {
        const url = String(input);
        const route = allowed.get(url);
        if (route && answerable(route)) {
          asked.push(url);
          return { ok: true, json: async () => route.body() };
        }
        unexpected.push(url);
        return { ok: false, status: 500, json: async () => ({}) }; // the caller's own failure path, which it handles
      }) as unknown as typeof fetch;
    },
    enlarge(session) {
      current = session;
      if (session) enlarged.add(session);
    },
    settled() {
      // A request the mount did not used to make. Recorded rather than thrown, because every
      // caller catches its own fetch failure and would swallow the throw.
      expect(unexpected).toEqual([]);
      if (!strict) return;
      // Lists on both sides: a missing route shows up as missing, a repeated one as repeated.
      const expected = [...allowed].filter(([, route]) => enlarged.has(route.session)).map(([url]) => url);
      expect([...asked].sort()).toEqual(expected.sort());
    },
  };
}
