export interface CommandProbe {
  isFile: (candidate: string) => boolean;
  isExecutable: (candidate: string) => boolean;
}

export declare function hasCommand(
  cmd: string,
  options?: { platform?: NodeJS.Platform; env?: Record<string, string | undefined>; probe?: CommandProbe },
): boolean;
