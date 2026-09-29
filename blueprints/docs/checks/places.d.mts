// Types for places.mjs, which the packs run with plain node and the specs import.
export function headingsIn(tree: unknown): Map<string, string>;
export function headingsOf(file: string): Map<string, string>;
export function namesPlace(text: string, address: string, heading: string | undefined): boolean;
