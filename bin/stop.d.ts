import type { InstanceEntry } from "./instances.js";

export interface StopEffects {
  kill?: (pid: number) => void;
  isAlive?: (pid: number) => boolean;
  sleep?: (ms: number) => Promise<void>;
  graceMs?: number;
}
export interface StubbornInstance extends InstanceEntry {
  reason: string;
}
export interface StopResult {
  stopped: InstanceEntry[];
  stubborn: StubbornInstance[];
}
export declare function stopInstances(instances: readonly InstanceEntry[], effects?: StopEffects): Promise<StopResult>;
export declare function describeInstance(instance: InstanceEntry): string;
export declare function stopReport(result: StopResult): string[];
export declare function stopExitCode(result: StopResult): number;
export declare function runStop(): Promise<void>;
