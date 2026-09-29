// Types for rules.mjs, which the pack runs with plain node and the specs import.
export type Citation = { readonly source: string; readonly address: string; readonly quote: string };
export type Event = {
  readonly id: string;
  readonly date: string;
  readonly weekday?: string;
  readonly start?: string;
  readonly end?: string;
  readonly title: string;
  readonly citation: Citation;
};
export type Amount = { readonly id: string; readonly label: string; readonly value: number; readonly unit: string; readonly citation: Citation };
export type Total = Amount & { readonly parts: readonly string[] };
export type Facts = { readonly events?: readonly Event[]; readonly amounts?: readonly Amount[]; readonly totals?: readonly Total[] };
export type Problem = { readonly id: string; readonly rule: string; readonly entries: readonly string[]; readonly detail: Readonly<Record<string, unknown>> };

export declare const weekdayIndex: (written: unknown) => number | undefined;
export declare const weekdayOfDate: (iso: unknown) => number | undefined;
export declare const weekdayLike: (written: unknown, index: number) => string | undefined;
export declare const isMonthDay: (value: unknown) => boolean;
export declare const minutesOf: (time: unknown) => number | undefined;
export declare const problemsIn: (facts: Facts) => Problem[];
