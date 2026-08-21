<script setup lang="ts">
import { useI18n } from "vue-i18n";
import { serverStopped } from "../composables/useServerStopped";

// Rendered the moment POST /api/shutdown is answered — i.e. while the server is still there to
// answer (#1820). It has to be up FIRST: once the process is gone this page can no longer load
// anything, so a screen fetched afterwards would never arrive.
const { t } = useI18n();
</script>

<template>
  <!-- `role="alert"` rather than a dialog: there is nothing here to focus or dismiss, and this is
       the one state a screen-reader user most needs told — the app is gone and no further
       interaction will do anything. -->
  <div v-if="serverStopped" data-testid="server-stopped-overlay" class="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-6">
    <div role="alert" aria-live="assertive" class="max-w-md rounded-[10px] border border-border bg-panel p-6 text-center font-sans text-fg shadow-xl">
      <p class="text-[14px] font-semibold">{{ t("settings.quit.stoppedTitle") }}</p>
      <p class="mt-2 text-[12px] text-dim">{{ t("settings.quit.stoppedBody") }}</p>
    </div>
  </div>
</template>
