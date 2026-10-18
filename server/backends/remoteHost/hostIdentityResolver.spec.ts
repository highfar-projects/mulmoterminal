// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

import { parseStoredIdentities, type HostIdentity, type LegacyHostDoc } from "./hostIdentity.js";
import { createHostIdentityResolver } from "./hostIdentityResolver.js";

interface FakeWorld {
  stored: unknown;
  legacyDoc: LegacyHostDoc | null;
  hostname: string;
  legacyReads: string[];
  // The record each write added, in order.
  writes: HostIdentity[];
  failLegacyRead?: boolean;
}

const world = (overrides: Partial<FakeWorld> = {}): FakeWorld => ({
  stored: null,
  legacyDoc: null,
  hostname: "work-mac.local",
  legacyReads: [],
  writes: [],
  ...overrides,
});

const resolverFor = (state: FakeWorld) =>
  createHostIdentityResolver({
    hostname: () => state.hostname,
    readStored: async () => state.stored,
    writeStored: async (identities) => {
      state.writes.push(identities[identities.length - 1]);
      state.stored = { identities };
    },
    readLegacyDoc: async (uid) => {
      state.legacyReads.push(uid);
      if (state.failLegacyRead) throw new Error("offline");
      return state.legacyDoc;
    },
    newSuffix: () => "0000ffff",
    newMachineId: () => "m-new",
  });

const LET_SECOND_REACH_ITS_WRITE_MS = 20;

describe("createHostIdentityResolver", () => {
  it("before any connect there is no current channel and no machine", () => {
    const resolver = resolverFor(world());
    expect(resolver.currentHostId("uid-1")).toBeNull();
    expect(resolver.currentHostId(null)).toBeNull();
    expect(resolver.currentMachine()).toBeNull();
  });

  it("a machine that was connected before machines were told apart keeps the legacy channel", async () => {
    const state = world({ legacyDoc: { machineId: null } });
    const resolver = resolverFor(state);
    expect(await resolver.resolveHostId("uid-1")).toBe("mulmoterminal");
    expect(state.writes).toEqual([{ uid: "uid-1", hostId: "mulmoterminal", machineId: "m-new", hostname: "work-mac.local" }]);
    expect(resolver.currentMachine()).toEqual({ machineId: "m-new", label: "work-mac" });
  });

  it("a new account's first machine, and any machine after the legacy one is claimed, gets its own channel", async () => {
    expect(await resolverFor(world()).resolveHostId("uid-1")).toBe("mulmoterminal-0000ffff");
    expect(await resolverFor(world({ legacyDoc: { machineId: "m-other" } })).resolveHostId("uid-1")).toBe("mulmoterminal-0000ffff");
  });

  it("a stored decision is reused without reading Firestore, and the channel stays the same across connects", async () => {
    const state = world({ stored: { identities: [{ uid: "uid-1", hostId: "mulmoterminal-abcdef01", machineId: "m-1", hostname: "work-mac.local" }] } });
    const resolver = resolverFor(state);
    expect(await resolver.resolveHostId("uid-1")).toBe("mulmoterminal-abcdef01");
    expect(await resolver.resolveHostId("uid-1")).toBe("mulmoterminal-abcdef01");
    expect(state.legacyReads).toEqual([]);
    expect(state.writes).toEqual([]);
    expect(resolver.currentHostId("uid-1")).toBe("mulmoterminal-abcdef01");
  });

  it("a record copied from another machine, or made for another account, is decided again", async () => {
    const stored = { identities: [{ uid: "uid-1", hostId: "mulmoterminal", machineId: "m-1", hostname: "work-mac.local" }] };
    const copied = world({ stored, hostname: "home-linux", legacyDoc: { machineId: "m-1" } });
    expect(await resolverFor(copied).resolveHostId("uid-1")).toBe("mulmoterminal-0000ffff");
    const otherAccount = world({ stored, legacyDoc: null });
    expect(await resolverFor(otherAccount).resolveHostId("uid-2")).toBe("mulmoterminal-0000ffff");
  });

  it("a malformed stored file is treated as none", async () => {
    const state = world({ stored: { identities: [{ hostId: 3 }] }, legacyDoc: { machineId: null } });
    expect(await resolverFor(state).resolveHostId("uid-1")).toBe("mulmoterminal");
  });

  it("an unreadable legacy doc rejects without writing or changing the current channel", async () => {
    const state = world({ failLegacyRead: true });
    const resolver = resolverFor(state);
    await expect(resolver.resolveHostId("uid-1")).rejects.toThrow("offline");
    expect(state.writes).toEqual([]);
    expect(resolver.currentHostId("uid-1")).toBeNull();
  });

  it("switching accounts and back keeps each account's channel", async () => {
    const state = world({ stored: { identities: [{ uid: "uid-1", hostId: "mulmoterminal-abcdef01", machineId: "m-1", hostname: "work-mac.local" }] } });
    const resolver = resolverFor(state);
    expect(await resolver.resolveHostId("uid-2")).toBe("mulmoterminal-0000ffff");
    expect(await resolver.resolveHostId("uid-1")).toBe("mulmoterminal-abcdef01");
    expect(state.legacyReads).toEqual(["uid-2"]);
    expect(
      parseStoredIdentities(state.stored)
        .map((identity) => identity.uid)
        .sort(),
    ).toEqual(["uid-1", "uid-2"]);
  });

  it("answers only for the account the channel was decided for", async () => {
    const state = world({ stored: { identities: [{ uid: "uid-1", hostId: "mulmoterminal-abcdef01", machineId: "m-1", hostname: "work-mac.local" }] } });
    const resolver = resolverFor(state);
    await resolver.resolveHostId("uid-1");
    expect(resolver.currentHostId("uid-2")).toBeNull();
    expect(resolver.currentHostId(null)).toBeNull();
  });

  it("a failed decision for a new account leaves no channel from the previous one", async () => {
    const state = world({ stored: { identities: [{ uid: "uid-1", hostId: "mulmoterminal-abcdef01", machineId: "m-1", hostname: "work-mac.local" }] } });
    const resolver = resolverFor(state);
    await resolver.resolveHostId("uid-1");
    state.failLegacyRead = true;
    await expect(resolver.resolveHostId("uid-2")).rejects.toThrow("offline");
    expect(resolver.currentHostId("uid-1")).toBeNull();
    expect(resolver.currentHostId("uid-2")).toBeNull();
    expect(resolver.currentMachine()).toBeNull();
  });

  // Core times a slow resolution out but cannot cancel it; when it finally finishes it must
  // not overwrite the file or the channel a later connect has already settled.
  it("a resolution overtaken by a later one neither writes nor takes effect", async () => {
    const state = world({ legacyDoc: null });
    const firstRead: { release: (doc: LegacyHostDoc | null) => void } = { release: () => undefined };
    const counters = { reads: 0, suffixes: 0 };
    const nextSuffix = (): string => {
      counters.suffixes += 1;
      return `0000000${counters.suffixes}`;
    };
    const resolver = createHostIdentityResolver({
      hostname: () => state.hostname,
      readStored: async () => null,
      writeStored: async (identities) => {
        state.writes.push(identities[identities.length - 1]);
      },
      readLegacyDoc: () => {
        counters.reads += 1;
        if (counters.reads > 1) return Promise.resolve(null);
        return new Promise((resolve) => {
          firstRead.release = resolve;
        });
      },
      newSuffix: nextSuffix,
      newMachineId: () => `m-${counters.suffixes}`,
    });
    const slow = resolver.resolveHostId("uid-1");
    expect(await resolver.resolveHostId("uid-1")).toBe("mulmoterminal-00000001");
    firstRead.release(null);
    await expect(slow).rejects.toThrow("superseded");
    expect(state.writes.map((identity) => identity.hostId)).toEqual(["mulmoterminal-00000001"]);
    expect(resolver.currentHostId("uid-1")).toBe("mulmoterminal-00000001");
  });

  it("a resolution overtaken while it is still writing the file does not take effect, and the newest file is written last", async () => {
    const pendingWrite: { finish: () => void } = { finish: () => undefined };
    const counters = { writes: 0, suffixes: 0 };
    const written: string[] = [];
    const resolver = createHostIdentityResolver({
      hostname: () => "work-mac.local",
      readStored: async () => null,
      writeStored: (identities) => {
        const identity = identities[identities.length - 1];
        counters.writes += 1;
        if (counters.writes > 1) {
          written.push(identity.hostId);
          return Promise.resolve();
        }
        return new Promise<void>((resolve) => {
          pendingWrite.finish = () => {
            written.push(identity.hostId);
            resolve();
          };
        });
      },
      readLegacyDoc: async () => null,
      newSuffix: () => {
        counters.suffixes += 1;
        return `0000000${counters.suffixes}`;
      },
      newMachineId: () => "m",
    });
    const slow = resolver.resolveHostId("uid-1");
    await vi.waitFor(() => expect(counters.writes).toBe(1));
    const fast = resolver.resolveHostId("uid-1");
    // Let the second resolution reach its own write before the first one's write lands.
    await new Promise((resolve) => setTimeout(resolve, LET_SECOND_REACH_ITS_WRITE_MS));
    pendingWrite.finish();
    expect(await fast).toBe("mulmoterminal-00000002");
    await expect(slow).rejects.toThrow("superseded");
    expect(resolver.currentHostId("uid-1")).toBe("mulmoterminal-00000002");
    expect(written).toEqual(["mulmoterminal-00000001", "mulmoterminal-00000002"]);
  });

  it("a write still in flight for one account keeps another account's record in the file", async () => {
    const uid2Record = { uid: "uid-2", hostId: "mulmoterminal-22222222", machineId: "m-2", hostname: "work-mac.local" };
    const file: { stored: unknown } = { stored: { identities: [uid2Record] } };
    const pendingWrite: { finish: () => void } = { finish: () => undefined };
    const resolver = createHostIdentityResolver({
      hostname: () => "work-mac.local",
      readStored: async () => file.stored,
      writeStored: (identities) =>
        new Promise<void>((resolve) => {
          pendingWrite.finish = () => {
            file.stored = { identities };
            resolve();
          };
        }),
      readLegacyDoc: async () => null,
      newSuffix: () => "11111111",
      newMachineId: () => "m-1",
    });
    const first = resolver.resolveHostId("uid-1");
    await new Promise((resolve) => setTimeout(resolve, LET_SECOND_REACH_ITS_WRITE_MS));
    expect(await resolver.resolveHostId("uid-2")).toBe("mulmoterminal-22222222");
    pendingWrite.finish();
    await first.catch(() => undefined);
    expect(parseStoredIdentities(file.stored)).toContainEqual(uid2Record);
  });
});
