// Types for outlineView.mjs, which the pack runs with plain node and the specs import.
export type Part = { readonly title: string; readonly file: string; readonly points: readonly string[] };

export declare const outlineText: (parts: readonly Part[]) => string;
