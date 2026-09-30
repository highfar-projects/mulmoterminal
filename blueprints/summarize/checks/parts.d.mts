// Types for parts.mjs, which the pack runs with plain node and the specs import.
export type Part = { readonly address: string; readonly name: string };
export type SummarizedDocument = { readonly source: string; readonly parts: readonly Part[] };

export declare const partsIn: (tree: unknown) => Part[];
export declare const within: (address: string, part: string) => boolean;
export declare const numbersIn: (text: unknown) => string[];
export declare const summaryProblems: (
  summary: unknown,
  documents: readonly SummarizedDocument[],
  maxSentences: number | null,
  nameOf: (source: unknown, address: unknown) => string | undefined,
) => string[];
