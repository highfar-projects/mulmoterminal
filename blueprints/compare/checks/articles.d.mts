// Types for articles.mjs, which the pack runs with plain node and the specs import.
export type Article = { readonly address: string; readonly label: string; readonly body: string };
export type Row = { readonly old?: string | null; readonly new?: string | null; readonly change: string; readonly what?: string };

export declare const CHANGES: readonly string[];
export declare const articlesIn: (tree: unknown, text: string) => Article[];
export declare const mentions: (text: string, name: string) => boolean;
export declare const comparisonProblems: (rows: unknown, olds: readonly Article[], news: readonly Article[]) => string[];
