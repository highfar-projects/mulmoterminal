// Reading a rotation token's secret from where its entry says it is (#2919). Per spawn and never
// cached, so a token replaced in the keychain reaches the next session without a restart. Nothing
// here logs the value: a failure names the entry, never what it held.
import { execFileSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { KEYCHAIN_ACCOUNT_DEFAULT, type RotationToken } from "../../../common/tokenRotation.js";
import { messageOf } from "../../errors.js";

const KEYCHAIN_TIMEOUT_MS = 5_000;
// By its absolute path, so a `security` earlier on PATH cannot be handed the lookup.
const SECURITY_BIN = "/usr/bin/security";
/** A token is ~110 bytes; anything past this is not a token file. */
export const TOKEN_FILE_MAX_BYTES = 4_096;

export interface TokenSecretDeps {
  keychain: (service: string, account: string) => string;
  readFile: (file: string) => string;
  homedir: string;
}

const keychainRead = (service: string, account: string): string =>
  execFileSync(SECURITY_BIN, ["find-generic-password", "-a", account, "-s", service, "-w"], {
    encoding: "utf8",
    timeout: KEYCHAIN_TIMEOUT_MS,
    stdio: ["ignore", "pipe", "ignore"],
  });

/** What a token file's stat says, as the refusal rule reads it. */
export interface TokenFileStat {
  isFile: boolean;
  size: number;
  mode: number;
  uid: number;
}

const GROUP_OR_OTHER_BITS = 0o077;

/**
 * Why a token file must not be read, or null when it may. Off Windows it has to be private the way
 * ssh demands of a key — a regular file, owned by this user, with no group or other bits — because a
 * token kept out of config, argv and env is still leaked by a file anyone on the machine can read.
 * Windows has no such mode bits to check.
 */
export function tokenFileRefusal(stat: TokenFileStat, platform: NodeJS.Platform, uid: number | undefined): string | null {
  if (!stat.isFile) return "not a regular file";
  if (stat.size > TOKEN_FILE_MAX_BYTES) return `larger than ${TOKEN_FILE_MAX_BYTES} bytes`;
  if (platform === "win32") return null;
  if (uid !== undefined && stat.uid !== uid) return "not owned by this user";
  return (stat.mode & GROUP_OR_OTHER_BITS) === 0 ? null : "readable by others: chmod 600 it";
}

const boundedRead = (file: string): string => {
  const stat = statSync(file);
  const refusal = tokenFileRefusal({ isFile: stat.isFile(), size: stat.size, mode: stat.mode, uid: stat.uid }, process.platform, process.getuid?.());
  if (refusal) throw new Error(refusal);
  return readFileSync(file, "utf8");
};

const DEFAULT_DEPS: TokenSecretDeps = { keychain: keychainRead, readFile: boundedRead, homedir: os.homedir() };

/** What a read returned, as a token: one line with no whitespace in it, or null. */
export function tokenFromText(text: string): string | null {
  const trimmed = text.trim();
  return trimmed && !/\s/.test(trimmed) ? trimmed : null;
}

const expandHome = (file: string, homedir: string): string => (file.startsWith("~/") ? path.join(homedir, file.slice(2)) : file);

const describe = (token: RotationToken): string => (token.keychain !== undefined ? `keychain item "${token.keychain}"` : `file ${token.file}`);

/** The token's secret, or null (with a warning naming the entry) when it cannot be read. */
export function readRotationToken(token: RotationToken, deps: TokenSecretDeps = DEFAULT_DEPS): string | null {
  try {
    const text =
      token.keychain !== undefined
        ? deps.keychain(token.keychain, token.keychainAccount ?? KEYCHAIN_ACCOUNT_DEFAULT)
        : deps.readFile(expandHome(token.file ?? "", deps.homedir));
    const secret = tokenFromText(text);
    if (!secret) console.warn(`[token-rotation] token "${token.id}": ${describe(token)} holds no token`);
    return secret;
  } catch (err) {
    console.warn(`[token-rotation] token "${token.id}": could not read ${describe(token)}: ${messageOf(err)}`);
    return null;
  }
}
