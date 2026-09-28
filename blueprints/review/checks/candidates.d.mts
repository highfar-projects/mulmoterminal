// Types for candidates.mjs, which the pack runs with plain node and the specs import.
export type Citation = { readonly source: string; readonly address: string; readonly quote: string };
export type ReviewFinding = { readonly id: string; readonly kind: string; readonly citations: readonly Citation[]; readonly machine?: unknown };
export type Dismissed = { readonly rule: string; readonly file: string; readonly line: number; readonly why?: string };
export type FeedbackCase = { readonly id: string; readonly kind: "wrong" | "missed"; readonly file: string; readonly rule: string; readonly line: number };

export declare const lineOfQuote: (text: string, quote: string) => number | undefined;
export declare const feedbackCases: (
  record: { readonly findings: readonly ReviewFinding[]; readonly dismissed: readonly Dismissed[] },
  textOf: (file: string) => string,
) => FeedbackCase[];
