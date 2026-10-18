// @vitest-environment node
import { describe, expect, it } from "vitest";

import type { HostIdentity, LegacyHostDoc } from "./hostIdentity.js";
import { createHostIdentityResolver } from "./hostIdentityResolver.js";

interface FakeWorld {
  stored: unknown;
  legacyDoc: LegacyHostDoc | null;
  hostname: string;
  legacyReads: string[];
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
    writeStored: async (identity) => {
      state.writes.push(identity);
      state.stored = identity;
    },
    readLegacyDoc: async (uid) => {
      state.legacyReads.push(uid);
      if (state.failLegacyRead) throw new Error("offline");
      return state.legacyDoc;
    },
    newSuffix: () => "0000ffff",
    newMachineId: () => "m-new",
  });

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
    const state = world({ stored: { uid: "uid-1", hostId: "mulmoterminal-abcdef01", machineId: "m-1", hostname: "work-mac.local" } });
    const resolver = resolverFor(state);
    expect(await resolver.resolveHostId("uid-1")).toBe("mulmoterminal-abcdef01");
    expect(await resolver.resolveHostId("uid-1")).toBe("mulmoterminal-abcdef01");
    expect(state.legacyReads).toEqual([]);
    expect(state.writes).toEqual([]);
    expect(resolver.currentHostId("uid-1")).toBe("mulmoterminal-abcdef01");
  });

  it("a record copied from another machine, or made for another account, is decided again", async () => {
    const stored = { uid: "uid-1", hostId: "mulmoterminal", machineId: "m-1", hostname: "work-mac.local" };
    const copied = world({ stored, hostname: "home-linux", legacyDoc: { machineId: "m-1" } });
    expect(await resolverFor(copied).resolveHostId("uid-1")).toBe("mulmoterminal-0000ffff");
    const otherAccount = world({ stored, legacyDoc: null });
    expect(await resolverFor(otherAccount).resolveHostId("uid-2")).toBe("mulmoterminal-0000ffff");
  });

  it("a malformed stored file is treated as none", async () => {
    const state = world({ stored: { hostId: 3 }, legacyDoc: { machineId: null } });
    expect(await resolverFor(state).resolveHostId("uid-1")).toBe("mulmoterminal");
  });

  it("an unreadable legacy doc rejects without writing or changing the current channel", async () => {
    const state = world({ failLegacyRead: true });
    const resolver = resolverFor(state);
    await expect(resolver.resolveHostId("uid-1")).rejects.toThrow("offline");
    expect(state.writes).toEqual([]);
    expect(resolver.currentHostId("uid-1")).toBeNull();
  });

  it("answers only for the account the channel was decided for", async () => {
    const state = world({ stored: { uid: "uid-1", hostId: "mulmoterminal-abcdef01", machineId: "m-1", hostname: "work-mac.local" } });
    const resolver = resolverFor(state);
    await resolver.resolveHostId("uid-1");
    expect(resolver.currentHostId("uid-2")).toBeNull();
    expect(resolver.currentHostId(null)).toBeNull();
  });

  it("a failed decision for a new account leaves no channel from the previous one", async () => {
    const state = world({ stored: { uid: "uid-1", hostId: "mulmoterminal-abcdef01", machineId: "m-1", hostname: "work-mac.local" } });
    const resolver = resolverFor(state);
    await resolver.resolveHostId("uid-1");
    state.failLegacyRead = true;
    await expect(resolver.resolveHostId("uid-2")).rejects.toThrow("offline");
    expect(resolver.currentHostId("uid-1")).toBeNull();
    expect(resolver.currentHostId("uid-2")).toBeNull();
    expect(resolver.currentMachine()).toBeNull();
  });
});
