# refactor: shared frame for the Rooms and Skills overlays (#2822, overlay-header cluster)

## What is extracted

`RoomsOverlay.vue` and `SkillsOverlay.vue` opened with the same markup: the full-screen region
under the top bar, and a header ending in a spacer and the close button. That frame is now
`src/components/FullScreenOverlay.vue`:

- props `regionLabel` / `closeLabel` — each overlay passes its own translated names, so the
  region's and the button's accessible names are unchanged;
- a `header` slot for what sits left of the spacer (the title, the room id, the search box);
- the default slot for the body;
- emits `close` when the button is clicked. The `data-tip` stays `tips.overlays.close`.

`v-if="isOpen"` stays on the overlay's use of the frame, so a closed overlay renders nothing,
as before.

## Why it preserves behaviour

The header's left side is a slot rather than a `title` prop, so each overlay keeps its own title
markup (the two titles differ in their classes). The rendered DOM is the same element tree with
the same classes and attributes.

The one difference: the old `@click="close"` handed the click event to `close`, while the frame
emits `close` with nothing attached. Both `roomsViewClose` and `skillsViewClose` take no
parameters, so nothing read that event.

Checked by mounting the old and new versions of each overlay side by side over generated states
and comparing the whole rendered HTML at each step, along with how many times `close` ran.
`test/src/components/FullScreenOverlay.spec.ts` keeps the properties from that comparison.

## Not done

Other overlays (`WikiBrowseOverlay`, `GithubOverlay`, `FilesOverlay`, ...) share the same region
class string. They are outside this cluster and were left alone.
