// A leading symbol narrows the command palette to one kind of row (#2462), as VS Code's does:
// `>` actions, `@` terminals, `/` file names, `#` file contents, and `?` the list of symbols. Pure,
// so the parse is a spec.
export const PALETTE_SCOPES = [
  { symbol: ">", kind: "action" },
  { symbol: "@", kind: "terminal" },
  { symbol: "/", kind: "file" },
  { symbol: "#", kind: "content" },
] as const;

export type ScopedKind = (typeof PALETTE_SCOPES)[number]["kind"];
export const HELP_SYMBOL = "?";

export type PaletteScope = { help: true } | { help: false; only: ScopedKind | null; rest: string };

export function scopeOf(query: string): PaletteScope {
  if (query.startsWith(HELP_SYMBOL)) return { help: true };
  const scope = PALETTE_SCOPES.find((entry) => query.startsWith(entry.symbol));
  return scope ? { help: false, only: scope.kind, rest: query.slice(scope.symbol.length).trimStart() } : { help: false, only: null, rest: query };
}
