// @vitest-environment node
// The ORDER between taking the loopback addresses and telling the parent we are listening.
//
// It is not tidiness. The launcher acts on this message — it prints the banner and opens the
// browser at `http://localhost:<port>` — and `localhost` prefers `::1` (measured on Chrome). So a
// message sent before `::1` is held invites the browser to an address this process has not
// claimed yet, and whatever claims it in between answers under this app's origin (Codex, #1903).
import { describe, it, expect, vi } from "vitest";

import {
  announceListening,
  listeningMessage,
  localBrowserUrl,
  localhostIsOurs,
  notLocalhostReason,
  type IpcParent,
} from "../../../server/infra/announce-listening.js";
import type { LoopbackListener, PrimaryListener } from "../../../server/infra/loopback-listener.js";

const primaryOn = (address: string): PrimaryListener => ({ address: () => ({ address }) });

/** Records the order of everything that happens, which is the thing under test. */
const harness = (outcomes: readonly ("ok" | "taken")[]) => {
  const events: string[] = [];
  const spares: LoopbackListener[] = outcomes.map((outcome) => {
    let onError: ((err: NodeJS.ErrnoException) => void) | undefined;
    return {
      once: (_event, handler) => {
        onError = handler;
        return undefined;
      },
      listen: (_port, address, onListening) => {
        // Asynchronously, as a real bind answers — so a caller that forgets to await sends first.
        setTimeout(() => {
          if (outcome === "ok") {
            events.push(`bound:${address}`);
            onListening();
          } else {
            events.push(`failed:${address}`);
            onError?.(Object.assign(new Error("in use"), { code: "EADDRINUSE" }));
          }
        }, 0);
        return undefined;
      },
    };
  });
  const sent: unknown[] = [];
  const parent: IpcParent = {
    connected: true,
    send: (message) => {
      events.push("announced");
      sent.push(message);
      return undefined;
    },
  };
  return { events, spares, parent, sent };
};

describe("announceListening", () => {
  it("takes the loopback addresses BEFORE it announces", async () => {
    const { events, spares, parent } = harness(["ok", "ok"]);
    await announceListening(primaryOn("192.168.64.1"), spares, 34567, "192.168.64.1", parent);
    expect(events).toEqual(["bound:127.0.0.1", "bound:::1", "announced"]);
  });

  it("reports localhost as ours when the listener took the missing loopback", async () => {
    const { spares, parent, sent } = harness(["ok"]);
    await announceListening(primaryOn("127.0.0.1"), spares, 34567, "127.0.0.1", parent);
    expect(sent).toEqual([{ type: "listening", port: 34567, address: "127.0.0.1", localhostIsOurs: true }]);
  });

  // The case the report exists for: the launcher's own probe ran before this process started, so
  // only this side can see a claim made during the boot.
  it("reports localhost as NOT ours when a bind lost, and still announces", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { events, spares, parent, sent } = harness(["taken"]);
    await announceListening(primaryOn("127.0.0.1"), spares, 34567, "127.0.0.1", parent);
    expect(events).toEqual(["failed:::1", "announced"]);
    expect(sent).toEqual([{ type: "listening", port: 34567, address: "127.0.0.1", localhostIsOurs: false }]);
    warn.mockRestore();
  });

  // A `::` bind serves `::1` itself, so there is no plan and nothing to lose.
  it("reports localhost as ours when the primary bind already answers there", async () => {
    const { spares, parent, sent } = harness(["ok"]);
    await announceListening(primaryOn("::"), spares, 34567, "::", parent);
    expect(sent).toEqual([{ type: "listening", port: 34567, address: "::", localhostIsOurs: true }]);
  });

  // `send` STAYS a function after the parent disconnects, and calling it then kills this process
  // with an async ERR_IPC_CHANNEL_CLOSED that no try/catch reaches.
  it("does not send to a parent that has disconnected", async () => {
    const { spares, parent, sent } = harness(["ok"]);
    await announceListening(primaryOn("127.0.0.1"), spares, 34567, "127.0.0.1", { ...parent, connected: false });
    expect(sent).toEqual([]);
  });

  it("is a no-op with no IPC channel at all — the `npx mulmoterminal` case", async () => {
    const { spares } = harness(["ok"]);
    const parent: IpcParent = { connected: true };
    await expect(announceListening(primaryOn("127.0.0.1"), spares, 34567, "127.0.0.1", parent)).resolves.toBeUndefined();
  });
});

describe("listeningMessage", () => {
  // The dev supervisor keys on `type` alone (#1735), so the shape may grow but must not lose it.
  it("always names itself, whatever else it carries", () => {
    expect(listeningMessage(34567, null, { v6LoopbackServed: false, v4LoopbackServed: true }).type).toBe("listening");
  });

  // A bind that is a pipe or is not listening reports no address; the launcher falls back rather
  // than guessing from a name.
  it("passes a null address through rather than inventing one", () => {
    expect(listeningMessage(34567, null, { v6LoopbackServed: true, v4LoopbackServed: true }).address).toBeNull();
  });
});

// What a direct `npm run server` prints is all its operator has — there is no launcher behind it
// to correct an address, so the line must not be written before the answer is known (#1903).
describe("localBrowserUrl", () => {
  const ok = { v6LoopbackServed: true, v4LoopbackServed: true };

  it("names localhost once every address it resolves to is ours", () => {
    expect(localBrowserUrl(34567, "127.0.0.1", ok)).toBe("http://localhost:34567");
  });

  // The whole point: `localhost` prefers `::1`, so naming it while a stranger holds that address
  // sends the operator to the stranger under this app's origin.
  it("refuses localhost when the v6 loopback was lost, and says why", () => {
    const lost = { v6LoopbackServed: false, v4LoopbackServed: true };
    expect(localBrowserUrl(34567, "127.0.0.1", lost)).toBe("http://127.0.0.1:34567");
    expect(notLocalhostReason(34567, lost)).toContain("[::1]:34567");
  });

  it("says nothing extra when localhost IS the answer", () => {
    expect(notLocalhostReason(34567, ok)).toBeNull();
  });

  // Neither loopback held: the bound address is the last thing that can still be asserted.
  // Asserted through `URL` rather than against a literal, which trips sonarjs/no-clear-text-
  // protocols — the same dodge test/bin/probe-bind-host.spec.ts uses, and it pins what matters.
  it("falls back to the address the kernel reported when neither loopback is ours", () => {
    const none = { v6LoopbackServed: false, v4LoopbackServed: false };
    const url = new URL(localBrowserUrl(34567, "192.168.64.1", none));
    expect(url.hostname).toBe("192.168.64.1");
    expect(url.port).toBe("34567");
  });

  it("brackets an IPv6 literal, which is not a URL unbracketed", () => {
    const none = { v6LoopbackServed: false, v4LoopbackServed: false };
    expect(new URL(localBrowserUrl(34567, "fd00::1", none)).hostname).toBe("[fd00::1]");
  });

  it("still names an address when the bind reported none at all", () => {
    const none = { v6LoopbackServed: false, v4LoopbackServed: false };
    expect(localBrowserUrl(34567, null, none)).toBe("http://127.0.0.1:34567");
  });
});

// `localhost` resolves to EITHER loopback and clients disagree about which they try first, so
// holding one of the two is not a smaller guarantee — it is none (Codex, #1903).
describe("localhostIsOurs", () => {
  it("needs both loopbacks, not either", () => {
    expect(localhostIsOurs({ v4LoopbackServed: true, v6LoopbackServed: true })).toBe(true);
    expect(localhostIsOurs({ v4LoopbackServed: true, v6LoopbackServed: false })).toBe(false);
    expect(localhostIsOurs({ v4LoopbackServed: false, v6LoopbackServed: true })).toBe(false);
    expect(localhostIsOurs({ v4LoopbackServed: false, v6LoopbackServed: false })).toBe(false);
  });

  // The reported case: a `::1` primary serves v6 itself, so only the v4 auxiliary can lose — and
  // an IPv4-preferring client would then reach whatever took it.
  it("refuses localhost when a ::1 primary lost the v4 bind", () => {
    const outcome = { v4LoopbackServed: false, v6LoopbackServed: true };
    expect(localBrowserUrl(34567, "::1", outcome)).toBe("http://[::1]:34567");
    expect(notLocalhostReason(34567, outcome)).toContain("127.0.0.1:34567");
  });

  it("names both addresses when both were lost", () => {
    const reason = notLocalhostReason(34567, { v4LoopbackServed: false, v6LoopbackServed: false });
    expect(reason).toContain("127.0.0.1:34567");
    expect(reason).toContain("[::1]:34567");
  });
});
