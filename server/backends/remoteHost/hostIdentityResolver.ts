// Decides this machine's channel once a session is signed in, keeps it on disk so it
// never changes on its own, and answers which channel is current for the writers that
// run outside the connect path (session activity, Web Push). Side effects are injected
// so the decision and its persistence are tested without Firebase or a home directory.
import type { HostMachine } from "@mulmoclaude/core/remote-host";

import { machineLabel, newIdentity, reusableIdentity, type HostIdentity, type LegacyHostDoc, parseStoredIdentities, withIdentity } from "./hostIdentity.js";

export interface HostIdentityResolverDeps {
  hostname: () => string;
  // The stored record's JSON, or null when there is none yet.
  readStored: () => Promise<unknown>;
  writeStored: (identities: HostIdentity[]) => Promise<void>;
  // users/{uid}/hosts/mulmoterminal from the server, or null when the doc does not exist.
  readLegacyDoc: (uid: string) => Promise<LegacyHostDoc | null>;
  newSuffix: () => string;
  newMachineId: () => string;
}

export const createHostIdentityResolver = (deps: HostIdentityResolverDeps) => {
  let current: HostIdentity | null = null;
  // Each resolution's number. Core gives up on a slow one but cannot cancel it, so one
  // that finishes after a later resolution began must not write or take effect.
  let latest = 0;

  const decide = async (uid: string, hostname: string): Promise<{ identity: HostIdentity; isNew: boolean }> => {
    const stored = reusableIdentity(parseStoredIdentities(await deps.readStored()), uid, hostname);
    if (stored) return { identity: stored, isNew: false };
    const legacyDoc = await deps.readLegacyDoc(uid);
    return { identity: newIdentity({ uid, hostname, legacyDoc, suffix: deps.newSuffix(), machineId: deps.newMachineId() }), isNew: true };
  };

  const assertLatest = (mine: number): void => {
    if (mine !== latest) throw new Error("remote-host: a later connect superseded this channel decision");
  };

  // Writes run one at a time, re-check when their turn comes, and re-read the file then,
  // so a write never drops another account's record or lands after a newer decision.
  let writes: Promise<void> = Promise.resolve();
  const persist = (mine: number, identity: HostIdentity): Promise<void> => {
    const write = writes.then(async () => {
      assertLatest(mine);
      const stored = parseStoredIdentities(await deps.readStored());
      assertLatest(mine);
      await deps.writeStored(withIdentity(stored, identity));
    });
    writes = write.catch(() => undefined);
    return write;
  };

  // A failure here rejects the connect; the next connect decides again. Guessing
  // instead could put two machines on one channel.
  const resolveHostId = async (uid: string): Promise<string> => {
    latest += 1;
    const mine = latest;
    current = null;
    const { identity, isNew } = await decide(uid, deps.hostname());
    assertLatest(mine);
    if (isNew) await persist(mine, identity);
    assertLatest(mine);
    current = identity;
    return identity.hostId;
  };

  // Only the channel decided for THIS account: after an account switch, or while a
  // decision is pending or has failed, there is none, and a writer must not guess.
  const currentHostId = (uid: string | null): string | null => (current && current.uid === uid ? current.hostId : null);

  const currentMachine = (): HostMachine | null => (current ? { machineId: current.machineId, label: machineLabel(current.hostname) } : null);

  return { resolveHostId, currentHostId, currentMachine };
};
