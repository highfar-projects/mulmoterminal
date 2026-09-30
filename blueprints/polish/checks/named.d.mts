// Types for named.mjs, which the pack runs with plain node and the specs import.
export type FolderReader = { readonly kindOf: (path: string) => "file" | "dir" | "link" | null; readonly entries: (dir: string) => string[] };

export declare const TEXT_FILE: RegExp;
export declare const insidePath: (line: string) => string | null;
export declare const namedTextFiles: (answer: unknown, fs: FolderReader) => { files: string[]; refused: string[] };
