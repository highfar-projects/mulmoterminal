export declare const NODE_RELEASES_URL: string;
export declare const CLAUDE_DIST_TAGS_URL: string;
export declare function fetchNodeReleases(): Promise<unknown>;
export declare function fetchClaudeStable(): Promise<string | null>;
export declare function resolveCommandPath(cmd: string, env?: Record<string, string | undefined>, platform?: string): string | null;
export declare function readClaudeVersion(binaryPath: string): Promise<string | null>;
export declare function checkVersions(options: { claudeBin: string | null }): Promise<{ node: string[]; claude: string[] }>;
