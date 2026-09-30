// Types for terms.mjs, which the pack runs with plain node and the specs import.
export type Citation = { readonly source: string; readonly address: string; readonly quote: string };

export declare const definedTermsIn: (tree: unknown) => string[];
export declare const glossaryProblems: (glossary: unknown, defined: readonly { readonly source: string; readonly terms: readonly string[] }[]) => string[];
export declare const citationsOf: (glossary: unknown) => Citation[];
export declare const definedTwice: (glossary: unknown) => string[];
export declare const avoidedSpellings: (glossary: unknown) => { avoided: string; preferred: string }[];
export declare const jargonOf: (glossary: unknown) => string[];
export declare const writesOnItsOwn: (text: string, pair: { readonly avoided: string; readonly preferred: string }) => boolean;
export declare const jargonListed: (yaml: string) => string[];
