// What the header shows for the machine's load (#1786), decided away from the component so the
// rules are testable without mounting anything — the arrangement rateLimitGauge.ts already uses
// for the gauges this sits beside.
//
// The figure is a PERCENTAGE OF THE CORES, not the raw average, so it reads against its
// neighbours (5h, 7d) in the same unit and means the same thing on a 4-core laptop as on a
// 20-core desktop: 100% is "every core has a runnable process", which is the line where starting
// another agent starts costing the ones already running. The raw triple stays in the hover, where
// it answers the second question — is this a spike or has it been like this for a quarter hour.

import type { MachineLoad } from "../../common/machineLoad";

/** The load is exactly the machine's capacity. Past it, work is queueing. */
export const BUSY_PERCENT = 100;
/** Twice the capacity: everything on this machine is now waiting for a core, which is what
 *  #1669 looked like for 48 minutes with nothing on screen to say so. */
export const SATURATED_PERCENT = 200;

export type LoadTone = "muted" | "amber" | "err";

export interface MachineLoadReadout {
  percent: number;
  tone: LoadTone;
  title: string;
}

const tone = (percent: number): LoadTone => {
  if (percent >= SATURATED_PERCENT) return "err";
  if (percent >= BUSY_PERCENT) return "amber";
  return "muted";
};

// Two decimals for the averages because that is how `uptime` prints them, and one for the ratio
// because its job is to be compared with 1 at a glance.
const title = (load: MachineLoad): string => {
  const averages = [load.avg1, load.avg5, load.avg15].map((n) => n.toFixed(2)).join(" / ");
  const ratio = (load.avg1 / load.cores).toFixed(1);
  return `Load average ${averages} — ${load.cores} cores (${ratio}x)`;
};

/** Null when there is nothing to draw. A host that keeps no load average arrives here as null and
 *  leaves as null rather than as 0%: a zero would say the machine is idle at the exact moment we
 *  cannot see it, which is the rule the gauges next door are built on. */
export function machineLoadReadout(load: MachineLoad | null): MachineLoadReadout | null {
  if (!load) return null;
  const percent = Math.round((load.avg1 / load.cores) * 100);
  return { percent, tone: tone(percent), title: title(load) };
}
