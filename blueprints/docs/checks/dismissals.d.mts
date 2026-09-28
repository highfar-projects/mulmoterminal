// Types for dismissals.mjs, which the packs run with plain node and the specs import.
export type Finding = { readonly rule: string; readonly level: string; readonly file: string; readonly line: number };
export type Dismissal = { readonly rule: string; readonly line: number; readonly because: "wrong" | "meaning"; readonly why: string };
export type WrongCase = { readonly id: string; readonly kind: "wrong"; readonly file: string; readonly rule: string; readonly line: number };

export declare const BECAUSE: readonly string[];
export declare const dismissalProblems: (label: string, dismissed: unknown, findings: readonly Finding[]) => string[];
export declare const withoutDismissed: (findings: readonly Finding[], dismissed: unknown) => Finding[];
export declare const unreportedDismissals: (owners: readonly { readonly key: string; readonly dismissed?: unknown }[], reportText: string) => string[];
export declare const wrongCases: (owners: readonly { readonly key: string; readonly file: string; readonly dismissed?: unknown }[]) => WrongCase[];
