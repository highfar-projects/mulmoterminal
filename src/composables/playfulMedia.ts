import { computed, ref } from "vue";
import { PLAYFUL_MEDIA_ROUTE, parsePublicPlayfulMedia, type PublicPlayfulMedia } from "../../common/playfulMedia";
import { fetchJson } from "../utils/fetchJson";

// The user's own playfulEffects pictures, as the server last listed them. Re-read whenever the
// config is, so Reload config file reaches it with no restart.
const media = ref<PublicPlayfulMedia>({ builtIn: true, items: [] });

export const playfulMedia = computed(() => media.value);

// Only the newest read may land: a slow one started before a reload must not put the old list back.
let latestRead = 0;

export async function loadPlayfulMedia(): Promise<void> {
  const read = ++latestRead;
  const result = await fetchJson(PLAYFUL_MEDIA_ROUTE, parsePublicPlayfulMedia);
  // A failed read keeps what was there: the built-in pictures still work without this list.
  if (result.ok && read === latestRead) media.value = result.data;
}
