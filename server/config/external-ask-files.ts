// The files behind the external ask routes (plans/feat-external-ask.md), all under ~/.mulmoterminal:
//
// - external-ask.json        — { "enabled": true, "allowDirs": [...], "label": "edgar" }, written by the user.
// - external-ask-token       — the bearer secret, made here the first time the feature is on.
// - external-asks.jsonl      — one line per send: when, which session and directory, the tag.
//
// Its own file rather than a key in config.json on purpose: this is fork-only, and every key added to
// app-config.ts is a conflict at the next upstream merge.
//
// The settings are read on every request, so turning the feature off takes effect without a restart.
import { promises as fs } from "node:fs";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { isRecord } from "../../common/isRecord.js";
import { writeFileAtomic } from "../files/atomic-write.js";
import { auditLine, parseExternalAskSettings, type ExternalAskSettings } from "../routes/externalAsk.js";

export const EXTERNAL_ASK_SETTINGS_FILE = "external-ask.json";
export const EXTERNAL_ASK_TOKEN_FILE = "external-ask-token";
export const EXTERNAL_ASK_LOG_FILE = "external-asks.jsonl";

const TOKEN_BYTES = 32;

const isMissing = (err: unknown): boolean => isRecord(err) && err.code === "ENOENT";

/** The settings, or "off" when the file is absent or unreadable — never an exception. */
export async function readExternalAskSettings(home: string): Promise<ExternalAskSettings> {
  try {
    return parseExternalAskSettings(JSON.parse(await fs.readFile(path.join(home, EXTERNAL_ASK_SETTINGS_FILE), "utf8")));
  } catch (err) {
    if (!isMissing(err)) console.warn(`[external-ask] ${EXTERNAL_ASK_SETTINGS_FILE} could not be read; the feature stays off: ${String(err)}`);
    return parseExternalAskSettings(null);
  }
}

let minting: Promise<string> | null = null;

/** The token, made the first time it is asked for. */
export async function ensureExternalAskToken(home: string): Promise<string> {
  const file = path.join(home, EXTERNAL_ASK_TOKEN_FILE);
  try {
    const existing = (await fs.readFile(file, "utf8")).trim();
    if (existing) return existing;
  } catch (err) {
    if (!isMissing(err)) throw err;
  }
  // One mint per process at a time, so two first requests do not write two different secrets.
  minting ??= (async () => {
    const token = randomBytes(TOKEN_BYTES).toString("hex");
    await fs.mkdir(home, { recursive: true });
    await writeFileAtomic(file, `${token}\n`);
    console.log(`[external-ask] made a token at ${file}`);
    return token;
  })().finally(() => {
    minting = null;
  });
  return minting;
}

export async function appendExternalAskLog(
  home: string,
  entry: { at: string; label: string; askId: string; session: string; cwd: string; chars: number },
): Promise<void> {
  try {
    await fs.mkdir(home, { recursive: true });
    await fs.appendFile(path.join(home, EXTERNAL_ASK_LOG_FILE), auditLine(entry));
  } catch (err) {
    console.error(`[external-ask] could not record a send: ${String(err)}`);
  }
}
