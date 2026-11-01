export declare const PORT_IN_USE_EXIT_CODE: number;
export declare const RESTART_EXIT_CODE: number;
export declare const RELAUNCH_ENV_VAR: string;
export declare function relaunchesOnRestart(env: Record<string, string | undefined>): boolean;
export declare const RESTART_MIN_DELAY_MS: number;
export declare const RESTART_MAX_DELAY_MS: number;
export declare const MAX_CONSECUTIVE_RESTARTS: number;
export declare function planAfterServerExit(exit: {
  code: number | null;
  signal: string | null;
  everServed: boolean;
  consecutiveFailures: number;
  platform: string;
  relaunches?: boolean;
}): {
  action: "port-in-use" | "restart" | "relaunch" | "stop";
  delayMs: number;
  reason: string | null;
};
