// Types for findingsView.mjs, which the pack runs with plain node and the specs import.
export type Citation = { readonly source: string; readonly address: string; readonly quote: string };
export type Finding = {
  readonly summary: string;
  readonly severity: string;
  readonly explanation: string;
  readonly citations: readonly Citation[];
  readonly proposal?: unknown;
};
export type Dismissed = { readonly rule: string; readonly file: string; readonly line: number; readonly why: string };

export declare function findingsText(record: { readonly findings: readonly Finding[]; readonly dismissed?: readonly Dismissed[] }): string;
