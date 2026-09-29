export interface CommandProbe {
  isFile: (candidate: string) => boolean;
  isExecutable: (candidate: string) => boolean;
}

export declare const realProbe: CommandProbe;
export declare const namesAPath: (cmd: string) => boolean;
export declare const extensionsFor: (platform: string) => string[];
export declare const searchDirectories: (platform: string, env: Record<string, string | undefined>) => string[];
export declare function hasCommand(
  cmd: string,
  options?: { platform?: NodeJS.Platform; env?: Record<string, string | undefined>; probe?: CommandProbe },
): boolean;
