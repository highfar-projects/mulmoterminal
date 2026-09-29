// The Wiki's pages as command-palette rows (#2503). Pure.
import type { WikiPageEntry } from "@mulmoclaude/core/wiki";

export interface PaletteWikiPage {
  slug: string;
  title: string;
  description: string;
  /** Searched beside the title: the slug, the description and the tags. */
  keywords: string;
}

// index.md can list one page twice, and a slug is the row's key: the first entry wins.
const firstPerSlug = (entries: readonly WikiPageEntry[]): WikiPageEntry[] =>
  entries.filter((entry, index) => entries.findIndex((other) => other.slug === entry.slug) === index);

export function paletteWikiPages(entries: readonly WikiPageEntry[]): PaletteWikiPage[] {
  return firstPerSlug(entries).map((entry) => ({
    slug: entry.slug,
    title: entry.title || entry.slug,
    description: entry.description,
    keywords: [entry.slug, entry.description, ...entry.tags.map((tag) => `#${tag}`)].filter((word) => word !== "").join(" "),
  }));
}
