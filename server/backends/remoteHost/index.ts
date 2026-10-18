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
import type { Express } from "express";
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

const SUFFIX_BYTES = 4;

const identity = createHostIdentityResolver({
  hostname: os.hostname,
  readStored: () => readHostIdentityFile(),
  writeStored: (record) => writeHostIdentityFile(record),
  readLegacyDoc: async (uid) => {
    const snapshot = await getDocFromServer(doc(currentFirestore(), "users", uid, "hosts", LEGACY_HOST_ID));
    return snapshot.exists() ? legacyHostDocOf(snapshot.data()) : null;
  },
  newSuffix: () => randomBytes(SUFFIX_BYTES).toString("hex"),
  newMachineId: randomUUID,
});

// Exported so the session-activity publisher (#439) and Web Push can address this
// machine's docs; they write from the hook path, outside the lifecycle this module owns.
export const currentHostId = identity.currentHostId;
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

export function initRemoteHostBackend(deps: RemoteHostBackendDeps): void {
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
    handlers: createRemoteHostHandlers({
      workspace: deps.workspace,
      spawnChat: deps.spawnChat,
      spawnIssueSeed: deps.spawnIssueSeed,
      ingest,
      mobileFileStager,
      listTerminalSessions: deps.listTerminalSessions,
      captureTerminalScreen: deps.captureTerminalScreen,
      captureTerminalTranscript: deps.captureTerminalTranscript,
      listPastSessions: deps.listPastSessions,
      readPastTranscript: deps.readPastTranscript,
      writeToSession: deps.writeToSession,
      canClearBox: deps.canClearBox,
      submitSequence: deps.submitSequence,
      sessionAgent: deps.sessionAgent,
      launchTerminal: deps.launchTerminal,
      openQuestion: deps.openQuestion,
      answerQuestion: deps.answerQuestion,
    }),
    log: { ...log, debug: () => undefined },
  });
}

export interface RemoteHostRouteOptions {
  isAllowedOrigin: (origin: string | undefined, remoteAddress: string | undefined) => boolean;
}

export function mountRemoteHostRoutes(app: Express, { isAllowedOrigin }: RemoteHostRouteOptions): void {
  mountRoutes(app, { isAllowedOrigin, getLifecycle: () => lifecycle, exportSession, reconnectErrorStatus, currentHealth });
}
