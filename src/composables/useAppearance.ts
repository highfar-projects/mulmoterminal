import { onMounted, onUnmounted, ref, type Ref } from "vue";

export type Appearance = "light" | "dark";

// Whether the page is drawn light or dark right now, from the `data-appearance` the theme puts on
// <html> (useTheme.ts). Followed live, so a theme switch re-blends whatever depends on it.
const readAppearance = (): Appearance => (document.documentElement.getAttribute("data-appearance") === "light" ? "light" : "dark");

export function useAppearance(): Ref<Appearance> {
  const appearance = ref<Appearance>(readAppearance());
  let watcher: MutationObserver | null = null;
  onMounted(() => {
    watcher = new MutationObserver(() => (appearance.value = readAppearance()));
    watcher.observe(document.documentElement, { attributes: true, attributeFilter: ["data-appearance"] });
  });
  onUnmounted(() => watcher?.disconnect());
  return appearance;
}

/** The blend that keeps terminal text readable through something drawn over it: the lighter
 *  pixel wins on a dark page, the darker on a light one. */
export const READABLE_BLEND: Record<Appearance, "mix-blend-screen" | "mix-blend-multiply"> = {
  dark: "mix-blend-screen",
  light: "mix-blend-multiply",
};
