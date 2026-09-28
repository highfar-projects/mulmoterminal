// A fixed colour and a theme colour on one element: the pair only reads in the theme the fixed one
// was picked for. A dark-theme hover background under the theme's text went unreadable in the
// light themes (#2437) — the text follows the theme and the background does not.

// A class string as it sits in a template or a script constant.
const CLASS_STRING = /class="([^"]*)"|["'`]([^"'`\n]*\bbg-\[#[^"'`\n]*)["'`]/g;
const FIXED_BG = /^bg-\[#[0-9a-fA-F]{3,8}\]$/;
const FIXED_TEXT = /^text-\[#[0-9a-fA-F]{3,8}\]$/;
const THEME_TEXT = new Set(["fg", "dim", "muted", "secondary", "inherit", "accent", "err-text", "amber", "ok"].map((token) => `text-${token}`));

/** A utility without its `hover:` / `enabled:` / … prefixes. */
const base = (utility: string): string => utility.slice(utility.lastIndexOf(":") + 1);

/** The fixed backgrounds in `classes` that sit under the theme's text colour with no fixed text
 *  colour of their own. Empty when the element is all-theme or all-fixed. */
export function fixedBackgroundsUnderThemeText(classes: string): string[] {
  const utilities = classes.split(/\s+/).filter(Boolean);
  const bases = utilities.map(base);
  if (bases.some((utility) => FIXED_TEXT.test(utility)) || !bases.some((utility) => THEME_TEXT.has(utility))) return [];
  return utilities.filter((utility) => FIXED_BG.test(base(utility)));
}

/** Every such mix in a file's source, with its line. */
export function themeColorMixes(source: string): { line: number; classes: string[] }[] {
  return source.split("\n").flatMap((text, index) =>
    [...text.matchAll(CLASS_STRING)].flatMap((match) => {
      const classes = fixedBackgroundsUnderThemeText(match[1] ?? match[2] ?? "");
      return classes.length > 0 ? [{ line: index + 1, classes }] : [];
    }),
  );
}
