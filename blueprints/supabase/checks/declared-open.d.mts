// Types for declared-open.mjs, which the pack runs with plain node and the specs import.
export declare function declarationsOf(parsed: unknown): Set<string>;
export declare function isDeclaredOpenPolicy(finding: unknown, declared: ReadonlySet<string>, ownersOf: ReadonlyMap<string, unknown>): boolean;
