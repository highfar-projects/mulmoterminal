// How a spec that owns a live pty gets rid of it, and what it reports when the shell will not go.
//
// Pure on purpose: the spec does the killing and the waiting, and this decides what the result
// means. A teardown that only ever runs on a loaded CI runner is otherwise a rule nobody can test.

export type KillSignal = "SIGHUP" | "SIGKILL";
export type KillEnding = "exited" | "still running";

export interface KillAttempt {
  /** `undefined` is node-pty's own default — the only kill Windows accepts. */
  signal: KillSignal | undefined;
  ending: KillEnding;
}

/** What was known about the shell when it first outlived a kill. */
export interface SurvivorFacts {
  platform: NodeJS.Platform;
  pid: number;
  shell: string | undefined;
  /** One `ps` line for the pid, or `undefined` when ps found nothing or could not be asked. */
  processState: string | undefined;
}

export type TeardownVerdict = { kind: "clean" } | { kind: "escalated"; report: string } | { kind: "survived"; report: string };

/** Greppable in a CI log, so an escalation that passed can still be counted. */
export const PTY_TEARDOWN_MARKER = "[pty-teardown]";

/** node-pty's Windows `kill()` throws on any signal, so Windows gets one bare kill and nothing to
 *  escalate to. POSIX starts with node-pty's default, SIGHUP, which is what production sends. */
export const killSignalsFor = (platform: NodeJS.Platform): readonly (KillSignal | undefined)[] => (platform === "win32" ? [undefined] : ["SIGHUP", "SIGKILL"]);

const signalName = (signal: KillSignal | undefined): string => signal ?? "kill()";

// A POSIX ps that finds no such pid means the shell is gone and node-pty never said so — a
// different bug from a shell that is still there, and the reason ps is asked at all.
function describeState(facts: SurvivorFacts): string {
  if (facts.processState !== undefined) return `ps: ${facts.processState}`;
  if (facts.platform === "win32") return "ps: not asked on win32";
  return "ps: no such process (gone, but onExit never fired)";
}

export function describeSurvivor(attempts: readonly KillAttempt[], facts: SurvivorFacts): string {
  const survived = attempts.filter((attempt) => attempt.ending === "still running").map((attempt) => signalName(attempt.signal));
  const parts = [
    PTY_TEARDOWN_MARKER,
    `shell pid ${facts.pid}`,
    `$SHELL=${facts.shell ?? "(unset)"}`,
    `survived ${survived.length > 0 ? survived.join(", ") : "nothing"}`,
    describeState(facts),
  ];
  return parts.join(" | ");
}

export function teardownVerdict(attempts: readonly KillAttempt[], facts: SurvivorFacts): TeardownVerdict {
  const exitedAt = attempts.findIndex((attempt) => attempt.ending === "exited");
  if (exitedAt === 0) return { kind: "clean" };
  const report = describeSurvivor(attempts, facts);
  return exitedAt > 0 ? { kind: "escalated", report } : { kind: "survived", report };
}
