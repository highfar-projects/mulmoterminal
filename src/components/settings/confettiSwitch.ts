import { CONFETTI_EVENTS, CONFETTI_STYLES, type Confetti, type ConfettiEvent, type ConfettiStyle } from "../../../common/confetti";

const inCatalogueOrder = <T>(catalogue: readonly T[], chosen: readonly T[]): T[] => catalogue.filter((item) => chosen.includes(item));

/** `style` switched on or off. Always keeps the catalogue's order, and never leaves the list empty:
 *  the last style cannot be switched off, because an empty list is read back as every style. */
export function confettiAfterStyle(setting: Confetti, style: ConfettiStyle, on: boolean): Confetti {
  const chosen = on ? [...setting.styles, style] : setting.styles.filter((current) => current !== style);
  const styles = inCatalogueOrder(CONFETTI_STYLES, chosen);
  return { ...setting, styles: styles.length > 0 ? styles : setting.styles };
}

/** `event` switched on or off; an empty list is how every event is off. */
export function confettiAfterEvent(setting: Confetti, event: ConfettiEvent, on: boolean): Confetti {
  const chosen = on ? [...setting.events, event] : setting.events.filter((current) => current !== event);
  return { ...setting, events: inCatalogueOrder(CONFETTI_EVENTS, chosen) };
}

/** Whether `style` may still be switched off: not when it is the only one left. */
export const confettiStyleLocked = (setting: Confetti, style: ConfettiStyle): boolean => setting.styles.length === 1 && setting.styles.includes(style);
