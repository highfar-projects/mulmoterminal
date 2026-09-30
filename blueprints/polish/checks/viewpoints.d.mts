// Types for viewpoints.mjs, which the pack runs with plain node and the specs import.
export type Viewpoint = { readonly title: string; readonly look: string; readonly fix: "may" | "writer" };
export type Catalog = { readonly viewpoints: Readonly<Record<string, Viewpoint>>; readonly genres: Readonly<Record<string, readonly string[]>> };
export type WriterItem = { readonly file: string; readonly id: string; readonly quote: string; readonly note?: string };

export declare const VERDICTS: readonly string[];
export declare const RECORD: string;
export declare const readCatalog: (usecaseDir: string) => Catalog;
export declare const readRecord: () => Record<string, unknown>;
export declare const viewpointsFor: (catalog: Catalog, genre: string | null) => readonly string[];
export declare const viewpointProblems: (input: {
  readonly file: string;
  readonly ids: readonly string[];
  readonly catalog: Catalog;
  readonly entries: unknown;
  readonly original: string;
  readonly current: string;
}) => string[];
export declare const writerItems: (record: unknown) => WriterItem[];
export declare const quotedIn: (quote: unknown, text: string) => boolean;
export declare const sectionText: (markdown: string, names: readonly string[]) => string;
export declare const unreportedWriterItems: (items: readonly WriterItem[], section: string) => string[];
