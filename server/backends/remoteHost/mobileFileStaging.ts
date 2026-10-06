// Handing the phone a file too large for the command document (#2911): the host puts it in the
// OWNER's Storage area, `users/{uid}/downloads/`, and deletes it again within the hour.
//
// Three layers of deletion, because each one depends on something the next does not:
//   1. a timer per object, armed at upload — needs this process to stay up;
//   2. a sweep of everything past its age, run when the phone next lists or opens — catches a restart;
//   3. the bucket's own lifecycle rule (mulmoserver) — catches a host that never comes back.
// The object name is a random id: the file's name and path never reach Storage, and the phone
// reads the object with its own credentials (never a token URL, which anyone holding it could open).
import { deleteObject, getMetadata, listAll, ref, uploadBytes, type FirebaseStorage } from "firebase/storage";

export const MOBILE_FILE_TTL_MS = 60 * 60 * 1000;
/** A cached object with less life left than this is staged afresh rather than handed out to expire mid-read. */
const REUSE_MARGIN_MS = 10 * 60 * 1000;
/** The age sweep lists the whole prefix, so it runs at most this often. */
const SWEEP_INTERVAL_MS = 10 * 60 * 1000;
const CACHE_CONTROL = "private, no-store";

export interface StagingStorage {
  upload: (storagePath: string, bytes: Uint8Array, contentType: string) => Promise<void>;
  remove: (storagePath: string) => Promise<void>;
  /** Every object under `prefix` with when it was created. */
  list: (prefix: string) => Promise<{ storagePath: string; createdAtMs: number }[]>;
}

export interface StagingDeps {
  storage: StagingStorage;
  uid: () => string | null;
  now: () => number;
  newId: () => string;
  /** Arms the per-object deletion; injected so a test can run it without waiting an hour. */
  schedule: (run: () => void, delayMs: number) => void;
  warn: (message: string) => void;
}

/** What identifies one version of one file: a changed file is a different object. */
export interface StagingKey {
  absolutePath: string;
  modifiedAtMs: number;
  bytes: number;
}

export interface StagedObject {
  storagePath: string;
  expiresAtMs: number;
}

export const downloadsPrefix = (uid: string): string => `users/${uid}/downloads`;

export function createMobileFileStager(deps: StagingDeps) {
  const cache = new Map<string, StagedObject>();
  let lastSweepMs = Number.NEGATIVE_INFINITY;

  const removeQuietly = async (storagePath: string): Promise<void> => {
    try {
      await deps.storage.remove(storagePath);
    } catch (error) {
      deps.warn(`[remote-host] could not delete staged file ${storagePath}; the bucket lifecycle rule will: ${String(error)}`);
    }
  };

  const sweep = async (uid: string): Promise<void> => {
    if (deps.now() - lastSweepMs < SWEEP_INTERVAL_MS) return;
    lastSweepMs = deps.now();
    try {
      const objects = await deps.storage.list(downloadsPrefix(uid));
      const expired = objects.filter((object) => deps.now() - object.createdAtMs >= MOBILE_FILE_TTL_MS);
      await Promise.all(expired.map((object) => removeQuietly(object.storagePath)));
    } catch (error) {
      deps.warn(`[remote-host] could not sweep staged files: ${String(error)}`);
    }
  };

  /** The staged object for this file version, uploading it unless a live one is cached. */
  const stage = async (key: StagingKey, read: () => Promise<Uint8Array>, contentType: string): Promise<StagedObject> => {
    const uid = deps.uid();
    if (!uid) throw new Error("This computer is not connected to your phone right now.");
    void sweep(uid);
    const cacheKey = [uid, key.absolutePath, key.modifiedAtMs, key.bytes].join("\0");
    const cached = cache.get(cacheKey);
    if (cached && cached.expiresAtMs - deps.now() > REUSE_MARGIN_MS) return cached;
    const storagePath = `${downloadsPrefix(uid)}/${deps.newId()}`;
    await deps.storage.upload(storagePath, await read(), contentType);
    const staged = { storagePath, expiresAtMs: deps.now() + MOBILE_FILE_TTL_MS };
    cache.set(cacheKey, staged);
    deps.schedule(() => {
      cache.delete(cacheKey);
      void removeQuietly(storagePath);
    }, MOBILE_FILE_TTL_MS);
    return staged;
  };

  /** Delete what outlived its hour — the leftovers of a previous run of this process. */
  const sweepExpired = async (): Promise<void> => {
    const uid = deps.uid();
    if (uid) await sweep(uid);
  };

  return { stage, sweepExpired };
}

export type MobileFileStager = ReturnType<typeof createMobileFileStager>;

/** The Firebase side. A getter for the instance, like ingest's: each reconnect opens a new one. */
export function firebaseStagingStorage(storage: () => FirebaseStorage): StagingStorage {
  return {
    upload: async (storagePath, bytes, contentType) => {
      await uploadBytes(ref(storage(), storagePath), bytes, { contentType, cacheControl: CACHE_CONTROL });
    },
    remove: (storagePath) => deleteObject(ref(storage(), storagePath)),
    list: async (prefix) => {
      const listing = await listAll(ref(storage(), prefix));
      return Promise.all(listing.items.map(async (item) => ({ storagePath: item.fullPath, createdAtMs: Date.parse((await getMetadata(item)).timeCreated) })));
    },
  };
}
