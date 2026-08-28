// @vitest-environment node
// The ORDER between taking the loopback addresses and telling the parent we are listening.
//
// It is not tidiness. The launcher acts on this message — it prints the banner and opens the
// browser at `http://localhost:<port>` — and `localhost` prefers `::1` (measured on Chrome). So a
// message sent before `::1` is held invites the browser to an address this process has not
// claimed yet, and whatever claims it in between answers under this app's origin (Codex, #1903).
import { describe, it, expect, vi } from "vitest";

import { announceListening, listeningMessage, type IpcParent } from "../../../server/infra/announce-listening.js";
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

  it("reports the v6 loopback as served when the listener took it", async () => {
    const { spares, parent, sent } = harness(["ok"]);
    await announceListening(primaryOn("127.0.0.1"), spares, 34567, "127.0.0.1", parent);
    expect(sent).toEqual([{ type: "listening", port: 34567, address: "127.0.0.1", v6LoopbackServed: true }]);
  });

  // The case the report exists for: the launcher's own probe ran before this process started, so
  // only this side can see a claim made during the boot.
  it("reports it as NOT served when the bind lost, and still announces", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { events, spares, parent, sent } = harness(["taken"]);
    await announceListening(primaryOn("127.0.0.1"), spares, 34567, "127.0.0.1", parent);
    expect(events).toEqual(["failed:::1", "announced"]);
    expect(sent).toEqual([{ type: "listening", port: 34567, address: "127.0.0.1", v6LoopbackServed: false }]);
    warn.mockRestore();
  });

  // A `::` bind serves `::1` itself, so there is no plan and nothing to lose.
  it("reports it as served when the primary bind already answers there", async () => {
    const { spares, parent, sent } = harness(["ok"]);
    await announceListening(primaryOn("::"), spares, 34567, "::", parent);
    expect(sent).toEqual([{ type: "listening", port: 34567, address: "::", v6LoopbackServed: true }]);
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
    expect(listeningMessage(34567, null, { v6LoopbackServed: false }).type).toBe("listening");
  });

  // A bind that is a pipe or is not listening reports no address; the launcher falls back rather
  // than guessing from a name.
  it("passes a null address through rather than inventing one", () => {
    expect(listeningMessage(34567, null, { v6LoopbackServed: true }).address).toBeNull();
  });
});
