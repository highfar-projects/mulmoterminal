// Remote-host lifecycle + route wiring for MulmoTerminal.
//
// Binds MulmoTerminal's Firebase deps + hostId to the shared createRemoteHost
// factory (@mulmoclaude/core/remote-host/server) so connecting from the toolbar
// signs in as the user and starts the Firestore command loop + presence heartbeat;
// disconnecting stops both. The transport engine lives in core; this module only
// supplies host specifics (hostId, handler table, session-backed runner, logger)
// and wires the module's lifecycle/session into the injectable routes (routes.ts).
//
// One channel per machine under an account (#3092): the machine that was connected
// before machines were told apart keeps "mulmoterminal" (distinct from MulmoClaude's
// "mulmoclaude"), every other one gets "mulmoterminal-<8 hex>", decided on its first
// connect and kept in ~/.mulmoterminal/remote-host.json (hostIdentityResolver.ts). The
// Firebase session is parked in the browser (case A', mulmoserver#50), so a server
// restart doesn't force a re-login: the client reconnects from its stored blob. The
// runner reads the CURRENT session's firestore/storage (both change on each
// (re)connect — see session.ts).
import type { Express, Request, Response } from "express";
import { coerceJsonObject, type CommandHandlers } from "@mulmoclaude/core/remote-host";
import {
  createPresenceProbe,
  createRemoteHost,
  startHostRunner,
  startResilientHostRunner,
  type RemoteHostLifecycle,
} from "@mulmoclaude/core/remote-host/server";
import { publish, clear, listFor } from "@mulmoclaude/core/notifier";

import type { RunnerHealth } from "../../../common/remoteHostHealth.js";
import { createHealthNotice } from "./healthNotice.js";
import { createRemoteHostHandlers, type RemoteHostHandlerDeps } from "./handlers/index.js";
import { createSaveAttachment } from "./attachmentStore.js";
import { buildIngestAttachments } from "./ingestAttachments.js";
import { randomBytes, randomUUID } from "node:crypto";
import os from "node:os";
import { doc, getDocFromServer } from "firebase/firestore";
import { createMobileFileStager, firebaseStagingStorage } from "./mobileFileStaging.js";
import { onExpire } from "./onExpire.js";
import { currentFirestore, currentStorage, currentUid, exportSession, reconnectErrorStatus, restore, signIn, signOut } from "./session.js";
import { mountRemoteHostRoutes as mountRoutes } from "./routes.js";
import { LEGACY_HOST_ID, legacyHostDocOf } from "./hostIdentity.js";
import { readHostIdentityFile, writeHostIdentityFile } from "./hostIdentityFile.js";
import { createHostIdentityResolver } from "./hostIdentityResolver.js";
import { createTerminalSessionHandlers } from "./handlers/terminalSession.js";
import { createPastSessionHandlers } from "./handlers/pastSessions.js";
import { PEER_COMMAND_PATH, PEER_COMMANDS } from "./peerProtocol.js";
import { withPeerSessions } from "./peerSessions.js";
import { callPeerCommand } from "./peerClient.js";
import { configuredPeers } from "../../infra/http/peer-proxy.js";
import { requestOriginAllowed } from "../../routes/same-origin-guard.js";
import { isRecord } from "../../../common/isRecord.js";
import { messageOf } from "../../errors.js";

const SUFFIX_BYTES = 4;

const identity = createHostIdentityResolver({
  hostname: os.hostname,
  readStored: () => readHostIdentityFile(),
  writeStored: (identities) => writeHostIdentityFile(identities),
  readLegacyDoc: async (uid) => {
    const snapshot = await getDocFromServer(doc(currentFirestore(), "users", uid, "hosts", LEGACY_HOST_ID));
    return snapshot.exists() ? legacyHostDocOf(snapshot.data()) : null;
  },
  newSuffix: () => randomBytes(SUFFIX_BYTES).toString("hex"),
  newMachineId: randomUUID,
});

// Exported so the session-activity publisher (#439) and Web Push can address this
// machine's docs; they write from the hook path, outside the lifecycle this module owns.
export const currentHostId = (): string | null => identity.currentHostId(currentUid());
const PREFIX = "[remote-host]";

// Module-level singleton — one host runner per process. Null until initialized.
let lifecycle: RemoteHostLifecycle | null = null;

// Health of the live command channel (#823). "offline" until a runner starts, so a host
// that was never connected doesn't claim to be healthy.
let health: RunnerHealth = { state: "offline", lastError: null, changedAt: 0 };
export const currentHealth = (): RunnerHealth => health;

// Everything the handlers need except `ingest` and `mobileFileStager`, which this module builds
// itself — they read the LIVE session's storage/uid, which only exist once a connection is up.
// Derived rather than restated so a new handler dependency cannot be added in one place only.
export type RemoteHostBackendDeps = Omit<RemoteHostHandlerDeps, "ingest" | "mobileFileStager">;

// The commands this server answers for a PARENT that relays it (peerProtocol.ts): its own session
// handlers and nothing else, built from the same deps the Firestore table is. Deliberately NOT
// wrapped with withPeerSessions — a server answers for its own sessions only, so two servers that
// list each other as peers cannot bounce a command between them.
let peerCommandHandlers: CommandHandlers | null = null;

export interface RemoteHostPeerOptions {
  /** Whether this server holds the session — decides whether a phone command stays here. */
  isLocalSession: (sessionId: string) => Promise<boolean>;
}

const ownPeerCommands = (deps: RemoteHostBackendDeps): CommandHandlers => {
  const own: CommandHandlers = { ...createTerminalSessionHandlers(deps), ...createPastSessionHandlers(deps) };
  return Object.fromEntries(Object.entries(own).filter(([name]) => PEER_COMMANDS.includes(name)));
};

// The table the Firestore runner serves: every handler, wrapped so the phone also reaches the cells
// of every configured peer (peerSessions.ts). A host with no peers behaves exactly as before.
const phoneHandlers = (
  deps: RemoteHostBackendDeps,
  live: Pick<RemoteHostHandlerDeps, "ingest" | "mobileFileStager">,
  peerOptions: RemoteHostPeerOptions,
  warn: (message: string) => void,
): CommandHandlers =>
  withPeerSessions(createRemoteHostHandlers({ ...deps, ...live }), {
    peers: configuredPeers,
    call: callPeerCommand,
    isLocal: peerOptions.isLocalSession,
    warn,
  });

export function initRemoteHostBackend(deps: RemoteHostBackendDeps, peerOptions: RemoteHostPeerOptions): void {
  peerCommandHandlers = ownPeerCommands(deps);
  // Ingest pulls the phone's staged uploads (Firebase Storage, signed in as the
  // user) into data/attachments/ and hands startChat path-only attachments. Reads
  // the LIVE session's storage/uid (both change per (re)connect — see session.ts).
  const ingest = buildIngestAttachments({ storage: currentStorage, uid: currentUid, saveAttachment: createSaveAttachment(deps.workspace) });
  const mobileFileStager = createMobileFileStager({
    storage: firebaseStagingStorage(currentStorage),
    uid: currentUid,
    now: Date.now,
    newId: randomUUID,
    schedule: (run, delayMs) => setTimeout(run, delayMs).unref(),
    warn: (message) => console.warn(message),
  });
  const log = {
    info: (msg: string) => console.log(PREFIX, msg),
    warn: (msg: string) => console.warn(PREFIX, msg),
  };
  const notice = createHealthNotice({ publish, clear, list: listFor, log });
  const onHealth = (next: RunnerHealth): void => {
    health = next;
    notice(next);
  };
  lifecycle = createRemoteHost({
    hostId: LEGACY_HOST_ID,
    resolveHostId: identity.resolveHostId,
    signIn,
    restore,
    signOut,
    currentUid,
    // core's runner recovers in place; this is the ring outside it, which starts a WHOLE new
    // runner and escalates to the client when even that stops helping (#823, #1064). It lives in
    // core because its give-up clock has to agree with core's own listen-retry window — the two
    // drifted apart once already, and a host carrying its own copy cannot see that happen.
    startRunner: (channel, handlers, options) =>
      startResilientHostRunner({
        // The machine fields tell the phone which machine this channel is, and let the
        // next machine to connect see that the legacy channel is already taken.
        start: (runnerOptions) => startHostRunner(currentFirestore(), channel, handlers, { ...runnerOptions, machine: identity.currentMachine() ?? undefined }),
        options,
        onHealth,
        // Asks whether the phone can still see us, instead of waiting to be told otherwise:
        // core's presence writes swallow their own failures, so silence proves nothing.
        checkAlive: createPresenceProbe({ firestore: currentFirestore, channel }),
        log,
      }),
    // Expired offline-queued startChat commands: delete the phone's staged Storage
    // uploads before the runner removes the doc (protocol v2 offline queue).
    onExpire,
    // No `expectedUndefined` on the runner options on purpose: every handler here is written to
    // omit an absent key rather than send `undefined` (#1042), so anything core reports is a
    // regression worth hearing about — declaring a path would be declaring it acceptable.
    handlers: phoneHandlers(deps, { ingest, mobileFileStager }, peerOptions, log.warn),
    log: { ...log, debug: () => undefined },
  });
}

export interface RemoteHostRouteOptions {
  isAllowedOrigin: (origin: string | undefined, remoteAddress: string | undefined) => boolean;
}

export function mountRemoteHostRoutes(app: Express, { isAllowedOrigin }: RemoteHostRouteOptions): void {
  mountRoutes(app, { isAllowedOrigin, getLifecycle: () => lifecycle, exportSession, reconnectErrorStatus, currentHealth });
  mountPeerCommandRoute(app, isAllowedOrigin);
}

// A parent relaying this server runs a phone command on one of OUR sessions (peerProtocol.ts).
// Guarded like every state-changing route: it types into terminals. Answered whether or not this
// server is itself connected to a phone — the parent is the one that is.
function mountPeerCommandRoute(app: Express, isAllowedOrigin: RemoteHostRouteOptions["isAllowedOrigin"]): void {
  app.post(PEER_COMMAND_PATH, async (req: Request, res: Response) => {
    if (!requestOriginAllowed(req, isAllowedOrigin)) {
      res.status(403).json({ error: "forbidden origin" });
      return;
    }
    const body: unknown = req.body;
    const name = isRecord(body) && typeof body.name === "string" ? body.name : "";
    const handler = peerCommandHandlers && PEER_COMMANDS.includes(name) ? peerCommandHandlers[name] : undefined;
    if (!handler) {
      res.status(404).json({ error: `unknown peer command "${name}"` });
      return;
    }
    try {
      const params = isRecord(body) && isRecord(body.params) ? coerceJsonObject(body.params) : {};
      res.json({ result: await handler(params) });
    } catch (err) {
      // The handler's own refusal, worded for the phone — the parent passes it on as it is.
      res.status(422).json({ error: messageOf(err) });
    }
  });
}
