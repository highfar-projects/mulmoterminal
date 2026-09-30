// Types for facts.mjs, which the pack runs with plain node and the specs import.
import type { Amount, Event } from "./rules.mjs";

export declare const FACT_KINDS: readonly ["events", "amounts", "totals", "products"];

export declare const asciiDigits: (text: unknown) => string;
export declare const datesIn: (quote: string) => { year: number | undefined; month: number; day: number }[];
export declare const monthDaysIn: (quote: string) => Set<string>;
export declare const yearDatesIn: (quote: string) => Set<string>;
export declare const weekdaysIn: (quote: string) => Set<number>;
export declare const timesIn: (quote: string) => Set<number>;
export declare const numbersIn: (quote: string) => Set<number>;
export declare const shapeProblems: (facts: unknown) => string[];
export declare function unquotedValues(key: "events", entry: Event): string[];
export declare function unquotedValues(key: "amounts" | "totals" | "products", entry: Amount): string[];
