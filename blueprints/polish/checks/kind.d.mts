// Types for kind.mjs, which the pack runs with plain node and the specs import.
export type Kind = { readonly option: string; readonly genre: string | null };

export declare const CHAFF_DEFAULT_STYLE: string;
export declare const genreOf: (answers: unknown, kinds: readonly Kind[]) => string | null;
export declare const genreArgs: (genre: string | null) => string[];
export declare const readKinds: (usecaseDir: string) => Kind[];
export declare const kindArgs: () => string[];
