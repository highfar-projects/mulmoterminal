export declare const REMOTION_PACKAGES: readonly string[];
export declare function resolverFromMulmocast(pkgDir: string): ((name: string) => boolean) | null;
export declare function missingRemotionPackages(isResolvable: (name: string) => boolean): string[];
export declare function remotionCheckLine(missing: readonly string[]): string;
