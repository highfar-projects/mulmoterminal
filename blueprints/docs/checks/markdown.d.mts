// Types for markdown.mjs, which the packs run with plain node and the specs import.
export type Section = { readonly heading: string; readonly hasBody: boolean };
export type Skeleton = { readonly headings: string[]; readonly code: string[]; readonly links: string[] };

export declare const sectionsOf: (markdown: string) => Section[];
export declare const missingSections: (markdown: string, wanted: readonly (readonly string[])[]) => string[];
export declare const skeletonOf: (markdown: string) => Skeleton;
export declare const skeletonChanges: (before: string, after: string) => string[];
export declare const sectionText: (markdown: string, names: readonly string[]) => string;
