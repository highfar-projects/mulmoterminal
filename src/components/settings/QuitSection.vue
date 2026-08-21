<script setup lang="ts">
import { ref } from "vue";
import { useI18n } from "vue-i18n";
import { markServerStopped } from "../../composables/useServerStopped";
import { fetchWithTimeout, SLOW_COMMAND_TIMEOUT_MS } from "../../utils/fetchWithTimeout";

// Stopping MulmoTerminal from the browser (#1820) — the counterpart of MulmoClaude's Quit tab, at
// the same route and with the same two-step shape, so someone running both hosts stops them the
// same way (../mulmoclaude/src/components/SettingsQuitTab.vue).
//
// The confirmation is INLINE rather than window.confirm, which is what the rest of this app uses
// for a destructive click. The difference is that this one has to explain an outcome — what
// happens to the running sessions — and a browser confirm gives no room to say it, being one line
// of text the browser styles itself.
const { t } = useI18n();

const confirming = ref(false);
const stopping = ref(false);
const failed = ref(false);

async function quit(): Promise<void> {
  if (stopping.value) return;
  stopping.value = true;
  failed.value = false;
  try {
    // The server answers BEFORE it stops (server/routes/shutdown-routes.ts), so this response is
    // the signal to put the stopped screen up. Waiting for the socket to die instead would leave
    // the user looking at a live-seeming app that is about to stop answering.
    const res = await fetchWithTimeout("/api/shutdown", { method: "POST" }, SLOW_COMMAND_TIMEOUT_MS);
    if (!res.ok) throw new Error(`POST /api/shutdown -> ${res.status}`);
    markServerStopped();
  } catch (err) {
    console.warn("[shutdown] request failed:", err);
    stopping.value = false;
    confirming.value = false;
    failed.value = true;
  }
}
</script>

<template>
  <p class="mb-2 text-[12px]">{{ t("settings.quit.description") }}</p>
  <p class="mb-3 text-[12px] text-dim">{{ t("settings.quit.restartHint") }}</p>

  <button
    v-if="!confirming"
    type="button"
    data-testid="quit-server"
    class="cursor-pointer rounded-md border border-[var(--err-strong)] bg-transparent px-3 py-1.5 text-[13px] text-[var(--err-text)] hover:bg-[var(--err-hover-bg)]"
    @click="confirming = true"
  >
    {{ t("settings.quit.button") }}
  </button>

  <div v-else data-testid="quit-confirm" class="rounded-md border border-[var(--err-strong)] bg-[var(--err-hover-bg)] p-3">
    <p class="mb-1 text-[12px]">{{ t("settings.quit.confirmBody") }}</p>
    <p class="mb-2.5 text-[12px] text-dim">{{ t("settings.quit.sessionsNote") }}</p>
    <div class="flex gap-2">
      <button
        type="button"
        data-testid="quit-confirm-yes"
        class="cursor-pointer rounded-md border-none bg-[var(--err-strong)] px-3 py-1.5 text-[13px] text-white disabled:cursor-progress disabled:opacity-60"
        :disabled="stopping"
        @click="quit"
      >
        {{ stopping ? t("settings.quit.stopping") : t("settings.quit.confirmButton") }}
      </button>
      <button
        type="button"
        data-testid="quit-cancel"
        class="cursor-pointer rounded-md border border-border bg-transparent px-3 py-1.5 text-[13px] hover:bg-hover disabled:cursor-progress"
        :disabled="stopping"
        @click="confirming = false"
      >
        {{ t("settings.quit.cancel") }}
      </button>
    </div>
  </div>

  <p v-if="failed" role="alert" class="mt-2 text-[12px] text-[var(--err-text)]" data-testid="quit-failed">{{ t("settings.quit.failed") }}</p>
</template>
