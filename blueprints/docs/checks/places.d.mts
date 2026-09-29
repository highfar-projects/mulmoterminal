// Types for places.mjs, which the packs run with plain node and the specs import.
export function headingsIn(tree: unknown): Map<string, string>;
export function namesPlace(text: string, address: string, heading: string | undefined, name?: string): boolean;
export function treeOf(file: string): unknown;
export function placeNamesIn(tree: unknown): Map<string, string>;
export function placeNamesOf(file: string): Map<string, string>;
export function placeNamer(sourcePath: (source: string) => { path?: string; problem?: string }): (source: string, address: string) => string;
