// Types for factsView.mjs, which the pack runs with plain node and the specs import.
import type { Facts } from "./rules.mjs";

export declare function factsText(facts: Facts, placeOf?: (source: string, address: string) => string): string;
