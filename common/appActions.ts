// The toolbar's operations as named actions: a `keymap` binding and a `run: "action"` header button
// reach them under these names. They act on the APP, not on a terminal, so they work on every
// screen. The command palette already has a row for each (screens, Settings sections, the sound /
// view / order choices), so it does not list them a second time.
import type { KeymapAction } from "./keymap.js";

export const SCREEN_ACTIONS = [
  "screen-terminals",
  "screen-collections",
  "screen-feeds",
  "screen-accounting",
  "screen-files",
  "screen-wiki",
  "screen-prs",
  "screen-rooms",
  "screen-blueprints",
  "screen-worklog",
] as const satisfies readonly KeymapAction[];

export const ORDER_ACTIONS = ["order-auto", "order-manual", "order-priority"] as const satisfies readonly KeymapAction[];

export const APP_ACTIONS = [...SCREEN_ACTIONS, "settings-open", "sound-toggle", "view-toggle", ...ORDER_ACTIONS] as const satisfies readonly KeymapAction[];

export type ScreenAction = (typeof SCREEN_ACTIONS)[number];
export type OrderAction = (typeof ORDER_ACTIONS)[number];
export type AppAction = (typeof APP_ACTIONS)[number];

export const isAppAction = (value: unknown): value is AppAction => APP_ACTIONS.some((action) => action === value);
export const isScreenAction = (value: AppAction): value is ScreenAction => SCREEN_ACTIONS.some((action) => action === value);
export const isOrderAction = (value: AppAction): value is OrderAction => ORDER_ACTIONS.some((action) => action === value);

const SCREEN_OF = {
  "screen-terminals": "terminals",
  "screen-collections": "collections",
  "screen-feeds": "feeds",
  "screen-accounting": "accounting",
  "screen-files": "files",
  "screen-wiki": "wiki",
  "screen-prs": "prs",
  "screen-rooms": "rooms",
  "screen-blueprints": "blueprints",
  "screen-worklog": "worklog",
} as const satisfies Record<ScreenAction, string>;

/** The screen a screen action goes to. */
export const screenOfAction = (action: ScreenAction): (typeof SCREEN_OF)[ScreenAction] => SCREEN_OF[action];

const ORDER_OF = { "order-auto": "auto", "order-manual": "manual", "order-priority": "priority" } as const satisfies Record<OrderAction, string>;

/** The cell order an order action chooses. */
export const orderOfAction = (action: OrderAction): (typeof ORDER_OF)[OrderAction] => ORDER_OF[action];
