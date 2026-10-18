// Which channel this machine uses under an account, when one account can connect
// several MulmoTerminal machines (#3092). Pure: the caller reads the stored record,
// the hostname and the legacy host doc, and supplies the random parts.
//
// The machine that was connected before this existed keeps the bare LEGACY_HOST_ID,
// so a one-machine user's phone pick and notification links keep working. Every other
// machine — including a new user's first — takes LEGACY_HOST_ID plus "-" and 8 hex
// digits, the shape the phone accepts (receptron/mulmoserver#356).
import { isRecord } from "../../../common/isRecord.js";

export const LEGACY_HOST_ID = "mulmoterminal";

export interface HostIdentity {
  uid: string;
  hostId: string;
  machineId: string;
  // The hostname the record was made on. A record read on another hostname was
  // copied there (a synced dotfiles directory), so it is not this machine's.
  hostname: string;
}

// The legacy host doc as read from users/{uid}/hosts/mulmoterminal: null when absent.
export interface LegacyHostDoc {
  machineId: string | null;
}

const isNonEmptyString = (value: unknown): value is string => typeof value === "string" && value !== "";

export const parseHostIdentity = (value: unknown): HostIdentity | null => {
  if (!isRecord(value)) return null;
  const { uid, hostId, machineId, hostname } = value;
  if (!isNonEmptyString(uid) || !isNonEmptyString(hostId) || !isNonEmptyString(machineId) || !isNonEmptyString(hostname)) return null;
  return { uid, hostId, machineId, hostname };
};

export const legacyHostDocOf = (data: unknown): LegacyHostDoc => ({
  machineId: isRecord(data) && isNonEmptyString(data.machineId) ? data.machineId : null,
});

// The stored record still names this machine for this account.
export const reusableIdentity = (stored: HostIdentity | null, uid: string, hostname: string): HostIdentity | null =>
  stored && stored.uid === uid && stored.hostname === hostname ? stored : null;

// Only a host doc that predates machine ids is a machine this one may be: it was
// connected before the upgrade, and the first machine to upgrade claims it.
export const chooseHostId = (legacyDoc: LegacyHostDoc | null, suffix: string): string =>
  legacyDoc && legacyDoc.machineId === null ? LEGACY_HOST_ID : `${LEGACY_HOST_ID}-${suffix}`;

export interface NewIdentityInput {
  uid: string;
  hostname: string;
  legacyDoc: LegacyHostDoc | null;
  suffix: string;
  machineId: string;
}

export const newIdentity = ({ uid, hostname, legacyDoc, suffix, machineId }: NewIdentityInput): HostIdentity => ({
  uid,
  hostId: chooseHostId(legacyDoc, suffix),
  machineId,
  hostname,
});

// What the phone shows for this machine: the hostname without macOS's ".local".
export const machineLabel = (hostname: string): string => hostname.replace(/\.local$/u, "") || hostname;
