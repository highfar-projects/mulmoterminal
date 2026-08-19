// Vue's reactivity taken off a message before the browser copies it.
//
// A message on its way to a sandboxed frame goes through structured clone, which REFUSES a Proxy —
// and datasets that arrive through a `ref` are proxies. The failure is a `DataCloneError` at the
// send, so the view sits on "loading…" with nothing on screen to say why.
//
// Its own module because it belongs to no component: the shared-app preview posts through it, and
// anything else handing reactive state to a `postMessage` needs exactly this.
import { toRaw } from "vue";

const isPlainObject = (value: unknown): value is Record<string, unknown> => {
  if (typeof value !== "object" || value === null) return false;
  const proto: unknown = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
};

/** Recursive because `toRaw` unwraps one level. Anything that is not a plain container is passed
 *  through untouched — structured clone copies a class instance's own fields by itself, and going
 *  through JSON instead would turn `NaN` and `±Infinity` into `null`. */
const unwrap = (value: unknown): unknown => {
  const raw: unknown = toRaw(value);
  if (Array.isArray(raw)) return raw.map(unwrap);
  if (isPlainObject(raw)) return Object.fromEntries(Object.entries(raw).map(([key, entry]) => [key, unwrap(entry)]));
  return raw;
};

/** Rebuilt entry by entry rather than unwrapped whole, so the shape is preserved by construction
 *  and nothing has to be asserted back into it. */
export function structuredCloneable(message: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(message).map(([key, value]) => [key, unwrap(value)]));
}
