// The command palette's collection actions (#2471): read once as the palette opens, and run the
// way a collection's own button runs one — the host builds the prompt, then a chat starts with it.
import { onMounted, ref } from "vue";
import { collectionUi } from "@mulmoclaude/collection-plugin/vue";
import { toCollectionActionGroups, type CollectionActionGroup } from "../../common/collectionActions";
import { activeCollectionProjectId } from "./collectionSurface";
import { withProject } from "./collectionProject";
import { fetchWithTimeout } from "../utils/fetchWithTimeout";

export function usePaletteCollectionActions() {
  const groups = ref<CollectionActionGroup[]>([]);
  onMounted(async () => {
    try {
      const res = await fetchWithTimeout(withProject("/api/collections/actions", activeCollectionProjectId()));
      groups.value = res.ok ? toCollectionActionGroups(await res.json()) : [];
    } catch {
      groups.value = [];
    }
  });
  // An agent action runs itself on the server (`dispatched`); only a chat's seed prompt is started here.
  const run = async (slug: string, actionId: string): Promise<void> => {
    const cui = collectionUi();
    const result = await cui.runCollectionAction(slug, actionId);
    if (result.ok && typeof result.data.prompt === "string") cui.startChat(result.data.prompt, result.data.role ?? "");
  };
  return { groups, run };
}
