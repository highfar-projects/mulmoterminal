// Types for named.mjs, which the pack runs with plain node and the specs import.
export type FolderReader = { readonly kindOf: (path: string) => "file" | "dir" | null; readonly entries: (dir: string) => string[] };

export declare const TEXT_FILE: RegExp;
export declare const namedTextFiles: (answer: unknown, fs: FolderReader) => string[];
