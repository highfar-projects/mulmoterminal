// The look of a toolbar menu driven by useAnchoredMenu: the panel, and one icon + label + detail row.
export const ANCHORED_MENU_PANEL_CLASS =
  "fixed z-[60] w-[min(18rem,calc(100vw-16px))] rounded-lg border border-border bg-panel p-1.5 font-sans text-fg shadow-xl";
export const ANCHORED_MENU_ITEM_CLASS =
  "flex w-full cursor-pointer items-start gap-2.5 rounded-md border-0 bg-transparent px-2.5 py-1.5 text-left text-fg hover:bg-hover";
// The Run / Skill / Mulmo list menus: a compact, scrolling column of one-line monospace rows.
export const LIST_MENU_PANEL_CLASS =
  "fixed z-[60] flex min-w-[min(180px,calc(100vw-16px))] max-w-[calc(100vw-16px)] max-h-[min(20rem,calc(100vh-16px))] flex-col overflow-y-auto rounded-md border border-border bg-panel p-1 shadow-[0_6px_20px_rgba(0,0,0,0.35)]";
export const LIST_MENU_ITEM_CLASS =
  "flex min-w-0 items-center gap-1 rounded border-0 bg-transparent px-2 py-1.5 text-left font-mono text-[12px] whitespace-nowrap text-secondary cursor-pointer hover:bg-hover hover:text-fg";
