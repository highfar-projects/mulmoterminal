// The command palette's collection actions (#2471): read once as the palette opens, and run the
// way a collection's own button runs one — the host builds the prompt, then a chat starts with it.
import { onMounted, ref } from "vue";
import { toCollectionActionGroups, type CollectionActionGroup } from "../../common/collectionActions";
import { activeCollectionProjectId } from "./collectionSurface";
import { makeCollectionUi } from "./collectionUi";
import { withProject } from "./collectionProject";
import { fetchWithTimeout } from "../utils/fetchWithTimeout";

export function usePaletteCollectionActions() {
  const groups = ref<CollectionActionGroup[]>([]);
  // The project the rows were listed from. A pick runs there, even if the Collections surface moved
  // to another project while the palette was open: same slug, different collection otherwise.
  let listedProject: string | null = null;
  onMounted(async () => {
    listedProject = activeCollectionProjectId();
    try {
      const res = await fetchWithTimeout(withProject("/api/collections/actions", listedProject));
      groups.value = res.ok ? toCollectionActionGroups(await res.json()) : [];
    } catch {
      groups.value = [];
    }
  });
  /** Runs the action; the error to show, or null when it ran. An agent action runs itself on the
   *  server (`dispatched`), so only a chat's seed prompt is started here. */
  const run = async (slug: string, actionId: string): Promise<string | null> => {
    const binding = makeCollectionUi(() => listedProject);
    const result = await binding.runCollectionAction(slug, actionId);
    if (!result.ok) return result.error;
    if (typeof result.data.prompt === "string") binding.startChat(result.data.prompt, result.data.role ?? "");
    return null;
  };
  return { groups, run };
}
