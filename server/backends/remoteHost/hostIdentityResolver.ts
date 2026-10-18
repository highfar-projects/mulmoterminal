// Decides this machine's channel once a session is signed in, keeps it on disk so it
// never changes on its own, and answers which channel is current for the writers that
// run outside the connect path (session activity, Web Push). Side effects are injected
// so the decision and its persistence are tested without Firebase or a home directory.
import {
  LEGACY_HOST_ID,
  machineLabel,
  newIdentity,
  parseHostIdentity,
  reusableIdentity,
  type HostIdentity,
  type LegacyHostDoc,
} from "./hostIdentity.js";

export interface HostIdentityResolverDeps {
  hostname: () => string;
  // The stored record's JSON, or null when there is none yet.
  readStored: () => Promise<unknown>;
  writeStored: (identity: HostIdentity) => Promise<void>;
  // users/{uid}/hosts/mulmoterminal from the server, or null when the doc does not exist.
  readLegacyDoc: (uid: string) => Promise<LegacyHostDoc | null>;
  newSuffix: () => string;
  newMachineId: () => string;
}

export interface HostMachineInfo {
  machineId: string;
  label: string;
}

export const createHostIdentityResolver = (deps: HostIdentityResolverDeps) => {
  let current: HostIdentity | null = null;

  const decide = async (uid: string, hostname: string): Promise<HostIdentity> => {
    const stored = reusableIdentity(parseHostIdentity(await deps.readStored()), uid, hostname);
    if (stored) return stored;
    const legacyDoc = await deps.readLegacyDoc(uid);
    const identity = newIdentity({ uid, hostname, legacyDoc, suffix: deps.newSuffix(), machineId: deps.newMachineId() });
    await deps.writeStored(identity);
    return identity;
  };

  // A failure here rejects the connect, which leaves any running channel alone; the
  // next connect decides again. Guessing instead could put two machines on one channel.
  const resolveHostId = async (uid: string): Promise<string> => {
    current = await decide(uid, deps.hostname());
    return current.hostId;
  };

  // Before the first connect there is no decision; the legacy id is what this host
  // used before machines were told apart.
  const currentHostId = (): string => current?.hostId ?? LEGACY_HOST_ID;

  const currentMachine = (): HostMachineInfo | null => (current ? { machineId: current.machineId, label: machineLabel(current.hostname) } : null);

  return { resolveHostId, currentHostId, currentMachine };
};
