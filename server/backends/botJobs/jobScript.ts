// What a bot job turns into on disk: the params mulmoserver's submitBotJob wrote, checked again here,
// and the `run.sh` a terminal cell runs to show the job, ask before running it, and record how it
// ended (plans/feat-bot-gpu-jobs.md). Pure, so the script is pinned without a PTY.
//
// The params are checked AGAIN although the function already did: the command channel is also
// writable by the user's own phone, and this side is the one about to run something.
import type { JsonObject } from "@mulmoclaude/core/remote-host";
import { isRecord } from "../../../common/isRecord.js";

export const MAX_SCRIPT_BYTES = 256 * 1024;
export const MAX_ARGS = 64;
export const MAX_ARG_LENGTH = 4096;
// The tail of the output that goes back. The command document also holds the script (up to 512 KiB
// with its args), and the whole document must stay under Firestore's 1 MiB.
export const MAX_OUTPUT_BYTES = 200 * 1024;

export interface BotJobRequest {
  script: string;
  args: string[];
  name: string | null;
  /** The token's name, written by submitBotJob from the token — never chosen by the bot. */
  from: string;
}

const isStringArray = (value: unknown): value is string[] => Array.isArray(value) && value.every((item) => typeof item === "string");

const fromOf = (value: unknown): string => {
  const name = isRecord(value) ? value.name : undefined;
  return typeof name === "string" && name.trim() ? name.trim() : "an unnamed bot";
};

export function parseBotJobRequest(params: JsonObject): BotJobRequest {
  const { script, args = [], name = null } = params;
  if (typeof script !== "string" || !script.trim()) throw new Error("script is required");
  if (Buffer.byteLength(script, "utf8") > MAX_SCRIPT_BYTES) throw new Error(`script is larger than ${MAX_SCRIPT_BYTES} bytes`);
  if (!isStringArray(args) || args.length > MAX_ARGS || args.some((arg) => arg.length > MAX_ARG_LENGTH)) {
    throw new Error(`args must be at most ${MAX_ARGS} strings of at most ${MAX_ARG_LENGTH} characters`);
  }
  if (name !== null && typeof name !== "string") throw new Error("name must be a string");
  return { script, args, name, from: fromOf(params.from) };
}

const ESCAPED_QUOTE = "'\\''";
/** One argument for /bin/sh, single-quoted: nothing inside is expanded, and an embedded quote is
 *  closed, escaped and reopened. */
export const shellQuote = (text: string): string => `'${text.replace(/'/g, ESCAPED_QUOTE)}'`;

// eslint-disable-next-line no-control-regex -- intentional: a label the terminal prints must not carry escape sequences
const CONTROL_BYTES = /[\u0000-\u001F\u007F-\u009F]+/g;

/** A label printed on the approval screen — the bot's name, the job's name. Control bytes would let
 *  it move the cursor and overwrite what the user is reading, so they become spaces. */
export const printable = (text: string): string => text.replace(CONTROL_BYTES, " ").trim();

// eslint-disable-next-line no-control-regex -- intentional: every control byte, one at a time
const CONTROL_BYTE = /[\u0000-\u001F\u007F-\u009F]/g;
const caretOf = (char: string): string => {
  const code = char.charCodeAt(0);
  if (code === 0x7f) return "^?";
  return code < 0x20 ? `^${String.fromCharCode(code + 0x40)}` : `<U+${code.toString(16).toUpperCase().padStart(4, "0")}>`;
};

/** Text shown on the approval screen exactly, with each control byte drawn as `cat -v` would
 *  (`^[`, `^J`) instead of sent to the terminal. For what the user must be able to read in full —
 *  the command line — where `printable`'s spaces would hide that something was there. */
export const visible = (text: string): string => text.replace(CONTROL_BYTE, caretOf);

/** `~/venv/bin/python` → under the home directory; anything else as written. */
export const expandHome = (python: string, home: string): string => {
  if (python === "~") return home;
  return python.startsWith("~/") ? home + python.slice(1) : python;
};

export const JOB_FILE = "job.py";
export const RUN_FILE = "run.sh";
export const OUTPUT_FILE = "output.log";
export const EXIT_CODE_FILE = "exit_code";
export const DECLINED_FILE = "declined";

// The approval is the guard, so what it shows has to be what runs:
// - `cat -v` prints the script with control characters made visible (`^[`). A plain `cat` would let
//   the script itself clear the screen or rewrite earlier lines, and be approved as something else.
// - The command line is printed from the same quoted words that are run, its control bytes drawn
//   visibly for the same reason as the script's.
// - Anything but an explicit yes declines, and so does end of input (`read` fails, answer is empty).
//
// The exit code is written by the subshell and moved into place only once `tee` has finished, so
// the waiting handler never reads `exit_code` before `output.log` is complete.
export function buildRunScript(job: BotJobRequest, python: string): string {
  const command = [python, JOB_FILE, ...job.args].map(shellQuote).join(" ");
  // What is shown is the command that runs, made safe to PRINT: an argument is the bot's text too,
  // and printed raw it could clear the preview above and redraw it as something else.
  const shown = visible(command);
  const what = job.name ? `: ${printable(job.name)}` : "";
  const title = `Bot job from ${printable(job.from)}${what}`;
  const banner = `----- ${JOB_FILE} (control characters shown as ^X) -----`;
  return [
    "#!/bin/sh",
    "# Written by MulmoTerminal for one bot job (plans/feat-bot-gpu-jobs.md).",
    'cd "$(dirname "$0")" || exit 1',
    `printf '\\n%s\\n' ${shellQuote(title)}`,
    `printf '%s\\n' ${shellQuote(banner)}`,
    `cat -v ${JOB_FILE}`,
    `printf '\\n%s\\n' '-----'`,
    `printf '%s\\n' ${shellQuote("Command: " + shown)}`,
    "printf 'Run this job? [y/N] '",
    "read answer",
    'case "$answer" in',
    "  y|Y|yes|Yes|YES) ;;",
    `  *) : > ${DECLINED_FILE}; printf '%s\\n' 'Declined. Nothing was run.'; exit 0 ;;`,
    "esac",
    `( PYTHONUNBUFFERED=1 ${command}; echo $? > ${EXIT_CODE_FILE}.tmp ) 2>&1 | tee ${OUTPUT_FILE}`,
    `mv ${EXIT_CODE_FILE}.tmp ${EXIT_CODE_FILE}`,
    `printf '\\n%s\\n' "Finished with exit code $(cat ${EXIT_CODE_FILE}). This shell stays open in the job directory."`,
    'exec "${SHELL:-/bin/sh}" -l',
    "",
  ].join("\n");
}

export interface JobOutput {
  output: string;
  truncated: boolean;
}

/** The last `maxBytes` of the output. A cut can land inside a multi-byte character; the replacement
 *  character that leaves at the front is dropped. */
export function outputTail(bytes: Buffer, maxBytes: number = MAX_OUTPUT_BYTES): JobOutput {
  if (bytes.length <= maxBytes) return { output: bytes.toString("utf8"), truncated: false };
  return {
    output: bytes
      .subarray(bytes.length - maxBytes)
      .toString("utf8")
      .replace(/^�+/u, ""),
    truncated: true,
  };
}

/** `exit_code` as the shell wrote it, or null when it is not a number. */
export const parseExitCode = (text: string): number | null => {
  const code = Number.parseInt(text.trim(), 10);
  return Number.isInteger(code) ? code : null;
};
