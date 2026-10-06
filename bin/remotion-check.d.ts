export declare function resolverFromMulmocast(pkgDir: string): ((name: string) => boolean) | null;
export declare function remotionPackagesFromMulmocast(pkgDir: string): Promise<readonly string[] | null>;
export declare function missingRemotionPackages(packages: readonly string[], isResolvable: (name: string) => boolean): string[];
export declare function remotionCheckLine(missing: readonly string[], total: number): string;
export declare function remotionCheck(pkgDir: string): Promise<string | null>;
