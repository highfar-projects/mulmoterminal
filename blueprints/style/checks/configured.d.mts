// Types for configured.mjs, which the pack runs with plain node and the specs import.
export declare const configuredRules: (current: unknown, configFile: string) => Map<string, string>;
export declare const unprovenRules: (configured: ReadonlyMap<string, string>, findings: readonly { readonly rule: string }[]) => string[];
