// The Wiki's pages as command-palette rows (#2503). Pure.
import type { WikiPageEntry } from "@mulmoclaude/core/wiki";

export interface PaletteWikiPage {
  slug: string;
  title: string;
  description: string;
  /** Searched beside the title: the slug, the description and the tags. */
  keywords: string;
}

export function paletteWikiPages(entries: readonly WikiPageEntry[]): PaletteWikiPage[] {
  return entries.map((entry) => ({
    slug: entry.slug,
    title: entry.title || entry.slug,
    description: entry.description,
    keywords: [entry.slug, entry.description, ...entry.tags.map((tag) => `#${tag}`)].filter((word) => word !== "").join(" "),
  }));
}
