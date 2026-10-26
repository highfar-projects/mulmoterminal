// Bot tokens: the secret a remote bot sends to mulmoserver's submitBotJob, minted for THIS host by
// the createBotToken callable and revoked by revokeBotToken (plans/feat-bot-gpu-jobs.md).
//
// mulmoserver keeps only the hash, and the secret is shown once. What is kept here is the list a
// user needs to revoke one later — id, name, host — never the secret itself.
import { promises as fs } from "node:fs";
import { firebaseConfig } from "../../../common/firebaseConfig.js";
import { isRecord } from "../../../common/isRecord.js";
import { writeFileAtomic } from "../../files/atomic-write.js";

const REGION = "asia-northeast1";
const functionUrl = (name: string): string => `https://${REGION}-${firebaseConfig.projectId}.cloudfunctions.net/${name}`;

/** What a bot is told to call, given to the user beside the secret. */
export const BOT_ENDPOINTS = { submit: functionUrl("submitBotJob"), result: functionUrl("getBotJob") } as const;

export interface BotTokenRecord {
  tokenId: string;
  name: string;
  hostId: string;
  createdAt: string;
}

export interface BotTokenDeps {
  file: string;
  idToken: () => Promise<string | null>;
  hostId: () => string | null;
  fetch: typeof globalThis.fetch;
  now: () => Date;
}

const NOT_CONNECTED = "Connect MulmoTerminal to the mobile remote first: a bot token belongs to this machine's connection.";

const parseRecord = (value: unknown): BotTokenRecord | null => {
  if (!isRecord(value)) return null;
  const { tokenId, name, hostId, createdAt } = value;
  return typeof tokenId === "string" && typeof name === "string" && typeof hostId === "string" && typeof createdAt === "string"
    ? { tokenId, name, hostId, createdAt }
    : null;
};

export async function readBotTokens(file: string): Promise<BotTokenRecord[]> {
  try {
    const parsed: unknown = JSON.parse(await fs.readFile(file, "utf8"));
    return Array.isArray(parsed) ? parsed.map(parseRecord).filter((record): record is BotTokenRecord => record !== null) : [];
  } catch {
    return [];
  }
}

const writeBotTokens = (file: string, records: BotTokenRecord[]): Promise<void> => writeFileAtomic(file, `${JSON.stringify(records, null, 2)}\n`);

// One read-modify-write of the list at a time. Two mints in flight would each read the same list and
// the later write would drop the other's record — leaving a live token at mulmoserver that nothing
// here can name to revoke. The atomic write keeps the FILE whole; this keeps the UPDATES.
let listUpdates: Promise<unknown> = Promise.resolve();
const updateBotTokens = (file: string, change: (records: BotTokenRecord[]) => BotTokenRecord[]): Promise<void> => {
  const next = listUpdates.then(async () => writeBotTokens(file, change(await readBotTokens(file))));
  listUpdates = next.catch(() => undefined);
  return next;
};

// The onCall wire: arguments in `data`, the answer in `result`, a failure in `error.message`.
async function callFunction(deps: BotTokenDeps, name: string, data: Record<string, string>): Promise<unknown> {
  const idToken = await deps.idToken();
  if (!idToken) throw new Error(NOT_CONNECTED);
  const res = await deps.fetch(functionUrl(name), {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${idToken}` },
    body: JSON.stringify({ data }),
  });
  const body: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const message = isRecord(body) && isRecord(body.error) && typeof body.error.message === "string" ? body.error.message : `HTTP ${res.status}`;
    throw new Error(`${name} failed: ${message}`);
  }
  return isRecord(body) ? body.result : undefined;
}

export interface CreatedBotToken {
  token: string;
  record: BotTokenRecord;
  endpoints: typeof BOT_ENDPOINTS;
}

export async function createBotToken(deps: BotTokenDeps, name: string): Promise<CreatedBotToken> {
  const hostId = deps.hostId();
  if (!hostId) throw new Error(NOT_CONNECTED);
  const result = await callFunction(deps, "createBotToken", { hostId, name });
  if (!isRecord(result) || typeof result.token !== "string" || typeof result.tokenId !== "string") throw new Error("createBotToken returned no token");
  const record: BotTokenRecord = { tokenId: result.tokenId, name, hostId, createdAt: deps.now().toISOString() };
  await updateBotTokens(deps.file, (records) => [...records, record]);
  return { token: result.token, record, endpoints: BOT_ENDPOINTS };
}

// Forgotten here only once mulmoserver has dropped it: a token still live there and missing here is
// one nobody can revoke any more.
export async function revokeBotToken(deps: BotTokenDeps, tokenId: string): Promise<void> {
  await callFunction(deps, "revokeBotToken", { tokenId });
  await updateBotTokens(deps.file, (records) => records.filter((record) => record.tokenId !== tokenId));
}
