// Which signals end a pty, in order. Pure, so the one rule every kill path shares is testable
// without a process to kill.

export type PtyKillSignal = "SIGHUP" | "SIGKILL";

/** node-pty's Windows `kill()` throws on any signal, so Windows gets one bare kill and nothing to
 *  escalate to. POSIX starts with node-pty's own default, SIGHUP — what a closed terminal sends —
 *  and escalates to SIGKILL for a program that ignored it. */
export const killSignalsFor = (platform: NodeJS.Platform): readonly (PtyKillSignal | undefined)[] =>
  platform === "win32" ? [undefined] : ["SIGHUP", "SIGKILL"];
