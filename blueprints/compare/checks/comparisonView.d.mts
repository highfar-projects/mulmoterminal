// Types for comparisonView.mjs, which the pack runs with plain node and the specs import.
import type { Article, Row } from "./articles.mjs";

export declare const comparisonText: (rows: readonly Row[], olds: readonly Article[], news: readonly Article[]) => string;
