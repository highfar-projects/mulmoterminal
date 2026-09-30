export declare function inSshSession(env: Record<string, string | undefined>): boolean;
export declare const configuredRemoteServer: (config: unknown) => boolean;
export declare function sshTunnelHintLines(env: Record<string, string | undefined>, port: number, remoteServer?: boolean): string[] | null;
