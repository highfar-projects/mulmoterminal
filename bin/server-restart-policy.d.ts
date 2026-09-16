export declare function restartPlan(exit: {
  code: number | null;
  signal: string | null;
  consecutiveFailures: number;
  minDelayMs: number;
  maxDelayMs: number;
  portInUseCode: number;
}): { retry: boolean; delayMs: number; reason: string };
