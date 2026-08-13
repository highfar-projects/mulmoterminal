import { onBeforeUnmount, watch, type Ref } from "vue";
import { pushCollectionTeleportTarget, popCollectionTeleportTarget } from "./collectionUi";

// Register a surface's shadow root as the record-modal teleport target while it is showing.
//
// The package's CollectionRecordModal teleports to the host-supplied target, and
// configureCollectionUi sets ONE global binding — so it cannot statically know which shadow root
// a given surface lives in. The probe element resolves it at runtime via getRootNode(), which
// inside PluginFrame returns that frame's ShadowRoot; without it the modal lands on <body>,
// outside the shadow root, and loses the injected plugin styles.
//
// Watched rather than registered once at mount: the probe rides a `v-if`ed detail page, so it
// appears and disappears while the surface stays mounted. Each change unregisters the previous
// root first, so a surface never holds two entries on the stack.
export function useCollectionTeleportTarget(probe: Ref<HTMLElement | undefined>): void {
  let registered: HTMLElement | ShadowRoot | null = null;

  const unregister = (): void => {
    if (registered) {
      popCollectionTeleportTarget(registered);
      registered = null;
    }
  };

  watch(probe, (el) => {
    unregister();
    const root = el?.getRootNode();
    if (root instanceof ShadowRoot) {
      registered = root;
      pushCollectionTeleportTarget(root);
    }
  });

  onBeforeUnmount(unregister);
}
