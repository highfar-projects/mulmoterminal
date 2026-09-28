// How a spec that owns a live pty gets rid of it, and what it reports when the shell will not go.
//
// Pure on purpose: the spec does the killing and the waiting, and this decides what the result
// means. A teardown that only ever runs on a loaded CI runner is otherwise a rule nobody can test.

import { isRecord } from "../../common/isRecord.js";

export type KillSignal = "SIGHUP" | "SIGKILL";
/** `exited late`: outlived the grace, then went on its own before the next signal was sent — a
 *  slow shell, which is a different answer from one that needed the next signal. */
export type KillEnding = "exited" | "exited late" | "still running";

export interface KillAttempt {
  /** `undefined` is node-pty's own default — the only kill Windows accepts. */
  signal: KillSignal | undefined;
  ending: KillEnding;
}

/** What `ps -p <pid>` said. `absent` is only a lookup that RAN and found nothing; a ps that could
 *  not run is `unavailable`, or it would be read as the shell having vanished. */
export type ProcessProbe = { kind: "found"; line: string } | { kind: "absent" } | { kind: "unavailable"; detail: string };

/** What running ps produced. `failure` is set when ps did not run to an exit of its own — not
 *  found, refused, timed out — which is the case an exit code alone cannot tell from "no such pid". */
export interface PsCapture {
  exitCode: number | null;
  stdout: string;
  stderr: string;
  failure: string | undefined;
}

/** What was known about the shell when it first outlived a kill. */
export interface SurvivorFacts {
  platform: NodeJS.Platform;
  pid: number;
  shell: string | undefined;
  processState: ProcessProbe;
}

export type TeardownVerdict =
  { kind: "clean" } | { kind: "late"; report: string } | { kind: "escalated"; report: string } | { kind: "survived"; report: string };

/** Greppable in a CI log, so a teardown that passed slowly can still be counted. */
export const PTY_TEARDOWN_MARKER = "[pty-teardown]";

// procps and BSD ps both exit 1 with nothing on stderr when the pid is not there.
const PS_NO_SUCH_PID_STATUS = 1;

/** node-pty's Windows `kill()` throws on any signal, so Windows gets one bare kill and nothing to
 *  escalate to. POSIX starts with node-pty's default, SIGHUP, which is what production sends. */
export const killSignalsFor = (platform: NodeJS.Platform): readonly (KillSignal | undefined)[] => (platform === "win32" ? [undefined] : ["SIGHUP", "SIGKILL"]);

const text = (value: unknown): string => (typeof value === "string" ? value : "");

/** execFile's rejection, read field by field: `code` is the exit status as a number, or an error
 *  code string (`ENOENT`, `EPERM`) when ps never ran; `killed` is the timeout. */
function failureOf(fields: Record<string, unknown>, timeoutMs: number): string | undefined {
  if (typeof fields.code === "string") return fields.code;
  return fields.killed === true ? `timed out after ${timeoutMs}ms` : undefined;
}

export function psCaptureFromError(error: unknown, timeoutMs: number): PsCapture {
  const fields = isRecord(error) ? error : {};
  return {
    exitCode: typeof fields.code === "number" ? fields.code : null,
    stdout: text(fields.stdout),
    stderr: text(fields.stderr),
    failure: failureOf(fields, timeoutMs),
  };
}

export function readPsProbe(capture: PsCapture): ProcessProbe {
  const line = capture.stdout.trim();
  if (line.length > 0) return { kind: "found", line };
  if (capture.failure !== undefined) return { kind: "unavailable", detail: capture.failure };
  const stderr = capture.stderr.trim();
  if (capture.exitCode === PS_NO_SUCH_PID_STATUS && stderr.length === 0) return { kind: "absent" };
  const firstStderrLine = stderr.split("\n")[0];
  return { kind: "unavailable", detail: stderr.length > 0 ? `exit ${capture.exitCode ?? "null"}: ${firstStderrLine}` : `exit ${capture.exitCode ?? "null"}` };
}

const signalName = (signal: KillSignal | undefined): string => signal ?? "kill()";

// An absent pid means the shell is gone and node-pty had not said so yet — a different answer from
// a shell that is still there, and the reason ps is asked at all.
function describeState(probe: ProcessProbe): string {
  if (probe.kind === "found") return `ps: ${probe.line}`;
  if (probe.kind === "absent") return "ps: no such process (gone before onExit arrived)";
  return `ps: unavailable (${probe.detail})`;
}

const signalsWhere = (attempts: readonly KillAttempt[], ending: KillEnding): string[] =>
  attempts.filter((attempt) => attempt.ending === ending).map((attempt) => signalName(attempt.signal));

export function describeSurvivor(attempts: readonly KillAttempt[], facts: SurvivorFacts): string {
  const survived = signalsWhere(attempts, "still running");
  const late = signalsWhere(attempts, "exited late");
  const parts = [
    PTY_TEARDOWN_MARKER,
    `shell pid ${facts.pid}`,
    `$SHELL=${facts.shell ?? "(unset)"}`,
    `survived ${survived.length > 0 ? survived.join(", ") : "nothing"}`,
    ...(late.length > 0 ? [`exited late after ${late.join(", ")}`] : []),
    describeState(facts.processState),
  ];
  return parts.join(" | ");
}

export function teardownVerdict(attempts: readonly KillAttempt[], facts: SurvivorFacts): TeardownVerdict {
  const exitedAt = attempts.findIndex((attempt) => attempt.ending === "exited");
  if (exitedAt === 0) return { kind: "clean" };
  const report = describeSurvivor(attempts, facts);
  if (attempts.some((attempt) => attempt.ending === "exited late")) return { kind: "late", report };
  return exitedAt > 0 ? { kind: "escalated", report } : { kind: "survived", report };
}
