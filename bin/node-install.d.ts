export interface NodeUpgradeGuide {
  via: string | null;
  commands: string[];
}
export declare const NODE_DOWNLOAD_URL: string;
export declare function nodeUpgradeGuide(execPath: string, platform: string, env: Record<string, string | undefined>): NodeUpgradeGuide;
