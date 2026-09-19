export declare const PORT_IN_USE_EXIT_CODE: number;
export declare const RESTART_MIN_DELAY_MS: number;
export declare const RESTART_MAX_DELAY_MS: number;
export declare const MAX_CONSECUTIVE_RESTARTS: number;
export declare function planAfterServerExit(exit: {
  code: number | null;
  signal: string | null;
  everServed: boolean;
  consecutiveFailures: number;
  platform: string;
}): {
  action: "port-in-use" | "restart" | "stop";
  delayMs: number;
  reason: string | null;
};
