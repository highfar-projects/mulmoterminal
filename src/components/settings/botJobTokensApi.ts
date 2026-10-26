// The Settings section's calls to /api/bot-tokens (server/backends/botJobs/routes.ts) and to the
// remote-host status it depends on: a token belongs to the machine's mobile-remote connection, so
// minting needs that connection up. Every call answers a value or an error sentence, never throws.
import { isRecord } from "../../../common/isRecord";
import { SLOW_COMMAND_TIMEOUT_MS, fetchWithTimeout } from "../../utils/fetchWithTimeout";

export interface BotTokenRow {
  tokenId: string;
  name: string;
  hostId: string;
  createdAt: string;
}

export interface BotEndpoints {
  submit: string;
  result: string;
}

export interface MintedBotToken {
  token: string;
  record: BotTokenRow;
  endpoints: BotEndpoints;
}

export type Answer<T> = { ok: true; value: T } | { ok: false; error: string };

const isRow = (value: unknown): value is BotTokenRow =>
  isRecord(value) &&
  typeof value.tokenId === "string" &&
  typeof value.name === "string" &&
  typeof value.hostId === "string" &&
  typeof value.createdAt === "string";

const isEndpoints = (value: unknown): value is BotEndpoints => isRecord(value) && typeof value.submit === "string" && typeof value.result === "string";

// Minting and revoking wait on a Cloud Function, whose cold start can outlast the default timeout.
async function call(url: string, init?: RequestInit, timeoutMs?: number): Promise<Answer<unknown>> {
  try {
    const res = await fetchWithTimeout(url, init, timeoutMs);
    const body: unknown = await res.json().catch(() => null);
    if (!res.ok) return { ok: false, error: isRecord(body) && typeof body.error === "string" ? body.error : `HTTP ${res.status}` };
    return { ok: true, value: body };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

const malformed = (what: string): Answer<never> => ({ ok: false, error: `unexpected answer from ${what}` });

export async function listBotTokens(): Promise<Answer<{ tokens: BotTokenRow[]; endpoints: BotEndpoints }>> {
  const answer = await call("/api/bot-tokens");
  if (!answer.ok) return answer;
  const body = answer.value;
  if (!isRecord(body) || !Array.isArray(body.tokens) || !isEndpoints(body.endpoints)) return malformed("/api/bot-tokens");
  return { ok: true, value: { tokens: body.tokens.filter(isRow), endpoints: body.endpoints } };
}

export async function mintBotToken(name: string): Promise<Answer<MintedBotToken>> {
  const answer = await call(
    "/api/bot-tokens",
    { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name }) },
    SLOW_COMMAND_TIMEOUT_MS,
  );
  if (!answer.ok) return answer;
  const body = answer.value;
  if (!isRecord(body) || typeof body.token !== "string" || !isRow(body.record) || !isEndpoints(body.endpoints)) return malformed("/api/bot-tokens");
  return { ok: true, value: { token: body.token, record: body.record, endpoints: body.endpoints } };
}

export async function revokeBotToken(tokenId: string): Promise<Answer<true>> {
  const answer = await call(`/api/bot-tokens/${encodeURIComponent(tokenId)}`, { method: "DELETE" }, SLOW_COMMAND_TIMEOUT_MS);
  return answer.ok ? { ok: true, value: true } : answer;
}

/** Whether this machine is connected to the mobile remote — false too when that cannot be told. */
export async function remoteHostConnected(): Promise<boolean> {
  const answer = await call("/api/remote-host/status");
  return answer.ok && isRecord(answer.value) && isRecord(answer.value.status) && answer.value.status.connected === true;
}
