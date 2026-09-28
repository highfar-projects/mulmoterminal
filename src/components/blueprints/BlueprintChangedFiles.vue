<script setup lang="ts">
// The files changed since a finished build started, each opening in the Files view: the report names what it
// produced, and this is where a person gets to it without finding the folder some other way.
import { useI18n } from "vue-i18n";
import { filesGotoFile, filesGotoIndex } from "../../composables/useFilesView";

const props = defineProps<{ projectDir: string; files: readonly string[]; more: boolean }>();
const { t } = useI18n();
</script>

<template>
  <section class="flex flex-col gap-2" data-testid="blueprint-changed">
    <h3 class="m-0 font-sans text-[13px] font-[650] text-fg">{{ t("blueprints.run.changed") }}</h3>
    <p v-if="props.files.length === 0" class="m-0 font-sans text-[12px] text-secondary">{{ t("blueprints.run.changedNone") }}</p>
    <ul v-else class="m-0 flex list-none flex-col gap-1 p-0">
      <li v-for="file in props.files" :key="file">
        <button
          type="button"
          data-testid="blueprint-changed-file"
          class="flex cursor-pointer items-center gap-1.5 border-none bg-transparent p-0 font-mono text-[12px] text-accent hover:underline"
          @click="filesGotoFile(props.projectDir, file)"
        >
          <span class="material-symbols-outlined text-[15px]">description</span>{{ file }}
        </button>
      </li>
    </ul>
    <p v-if="props.more" class="m-0 font-sans text-[12px] text-secondary">{{ t("blueprints.run.changedMore") }}</p>
    <div>
      <button
        type="button"
        data-testid="blueprint-open-folder"
        class="flex cursor-pointer items-center gap-1.5 rounded-[4px] border border-border bg-base px-3 py-1 font-sans text-[12px] text-fg hover:bg-hover"
        @click="filesGotoIndex(props.projectDir)"
      >
        <span class="material-symbols-outlined text-[15px]">folder_open</span>{{ t("blueprints.run.openFolder") }}
      </button>
    </div>
  </section>
</template>
