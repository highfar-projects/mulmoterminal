import type { execFileSync } from "node:child_process";

export declare function hasCommand(cmd: string, versionArgs?: readonly string[], run?: typeof execFileSync): boolean;
