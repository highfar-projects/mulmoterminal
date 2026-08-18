// The machine's own run-queue load, shown beside the 5h / 7d usage gauges (#1786): "may I start
// another agent right now?" is a question about this host, and it was the one number the grid
// header did not carry.
//
// Shared because both sides decide from it: the server reads the kernel's figures, the header
// turns them into a percentage of the cores it has.

import { isRecord } from "./isRecord.js";

export interface MachineLoad {
  /** The 1 / 5 / 15 minute averages, as the kernel reports them. */
  avg1: number;
  avg5: number;
  avg15: number;
  /** What makes the averages readable — 66.8 is quiet on 128 cores and hopeless on 4. */
  cores: number;
}

/** Windows keeps no load average, and Node says so by returning `[0, 0, 0]` rather than failing.
 *  Decided on the PLATFORM and never on the values: an idle mac reports 0.00 too, and reading
 *  that as "unknown" would drop the one reading we can vouch for. */
export const keepsLoadAverage = (platform: string): boolean => platform !== "win32";

// A negative average, a NaN, or a machine claiming zero cores describes no machine. Rejected
// whole rather than per field: the percentage divides one by the other, so a reading missing
// either half cannot be drawn at all.
const usableLoad = (avg1: number, avg5: number, avg15: number, cores: number): MachineLoad | null => {
  const sane = (n: number): boolean => Number.isFinite(n) && n >= 0;
  if (!sane(avg1) || !sane(avg5) || !sane(avg15)) return null;
  if (!Number.isInteger(cores) || cores <= 0) return null;
  return { avg1, avg5, avg15, cores };
};

/** The reading, or null where there is nothing to report. Pure — `node:os` is touched by the one
 *  caller in `server/infra/machine-load.ts`, so every rule here stays testable without waiting for
 *  a machine that happens to be busy. */
export function machineLoadFrom(averages: readonly number[], cores: number, platform: string): MachineLoad | null {
  if (!keepsLoadAverage(platform)) return null;
  const [avg1, avg5, avg15] = averages;
  if (avg1 === undefined || avg5 === undefined || avg15 === undefined) return null;
  return usableLoad(avg1, avg5, avg15, cores);
}

/** What the browser accepts back. A field of the wrong type is not "absent" — it is a shape this
 *  client has not been taught, and rendering half of it would put a number on screen that no
 *  machine reported. */
export function parseMachineLoad(value: unknown): MachineLoad | null {
  if (!isRecord(value)) return null;
  const { avg1, avg5, avg15, cores } = value;
  if (typeof avg1 !== "number" || typeof avg5 !== "number" || typeof avg15 !== "number" || typeof cores !== "number") return null;
  return usableLoad(avg1, avg5, avg15, cores);
}
