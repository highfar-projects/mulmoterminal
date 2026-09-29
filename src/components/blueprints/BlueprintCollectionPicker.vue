<script setup lang="ts">
// The collection a build starts from, chosen from the ones the server would accept rather than typed.
import { onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import { listSourceCollections } from "../../composables/blueprintsApi";
import { failureText } from "./refusalText";

defineProps<{ fieldId: string; answer: string }>();
const emit = defineEmits<{ update: [answer: string | undefined] }>();
const { t } = useI18n();

const collections = ref<{ slug: string; title: string }[] | null>(null);
const error = ref<string | null>(null);

onMounted(async () => {
  const result = await listSourceCollections();
  error.value = result.ok ? null : failureText(t, result);
  collections.value = result.ok ? result.value.collections : [];
});

const onChange = (event: Event): void => {
  if (event.target instanceof HTMLSelectElement) emit("update", event.target.value === "" ? undefined : event.target.value);
};
</script>

<template>
  <div class="flex flex-col gap-1" data-testid="blueprint-collection-picker">
    <select
      :id="fieldId"
      :value="answer"
      class="w-full max-w-[420px] rounded-[4px] border border-border bg-input px-2 py-1.5 font-sans text-[12px] text-fg"
      @change="onChange"
    >
      <option value="" disabled>{{ t("blueprints.form.pickCollection") }}</option>
      <option v-for="collection in collections ?? []" :key="collection.slug" :value="collection.slug">{{ collection.title }} ({{ collection.slug }})</option>
    </select>
    <p v-if="error" class="m-0 font-sans text-[11px] text-err-text">{{ error }}</p>
    <p v-else-if="collections !== null && collections.length === 0" class="m-0 font-sans text-[11px] text-dim" data-testid="blueprint-collection-none">
      {{ t("blueprints.form.pickCollectionNone") }}
    </p>
  </div>
</template>
