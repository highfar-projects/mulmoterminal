// The one place the `paletteSearchBox` setting is defined (#2569): a search box in the middle of
// the top bar that opens the command palette. Both sides decide from it, like showLoadAverage.

/** OFF unless the config says otherwise: the toolbar's Commands button and the palette key already
 *  open the palette, and the box takes the bar's free space, so it is for those who ask for it. */
export const PALETTE_SEARCH_BOX_DEFAULT = false;

// The key stays a literal on both sides, for the reason common/showLoadAverage.ts gives.

/** Anything that is not a boolean is "unconfigured". */
export const sanitizePaletteSearchBox = (input: unknown): boolean => (typeof input === "boolean" ? input : PALETTE_SEARCH_BOX_DEFAULT);
