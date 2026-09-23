<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { UI_LANGUAGE_AUTO, UI_LOCALES, browserLanguageTag, resolveUiLocale, uiLanguage } from "../../composables/uiLanguage";
import { withEnglish } from "../../i18n/englishAnchor";
import { SELECT_CONTROL } from "../selectClasses";

const { t, locale } = useI18n();

// The English half of the two strings that LEAD here, read out of the `en` bundle rather than
// written into the other four (#2204). Doing it the other way would put the same English sentence
// in every locale file, which is four places to forget it when a fifth lands.
const english = (key: string): string => t(key, {}, { locale: "en" });

/** A label with English beside it, unless the screen is already in English. */
const anchored = (key: string): string => withEnglish(t(key), english(key), locale.value);

// What `auto` currently resolves to, spelled out: the picker otherwise says "my browser's language"
// and leaves the reader to guess whether this browser is one the app has a bundle for.
const resolvedLabel = computed(() => UI_LOCALES.find((locale) => locale.code === resolveUiLocale(uiLanguage.value))?.label ?? "");
</script>

<template>
  <p class="mb-3 mt-1.5 text-[12px] text-dim">{{ t("settings.language.intro") }}</p>
  <select v-model="uiLanguage" :aria-label="anchored('settings.language.picker')" :class="SELECT_CONTROL">
    <option :value="UI_LANGUAGE_AUTO">{{ anchored("settings.language.auto") }}</option>
    <option v-for="entry in UI_LOCALES" :key="entry.code" :value="entry.code">
      {{ withEnglish(entry.label, entry.english, locale) }}
    </option>
  </select>
  <p v-if="uiLanguage === UI_LANGUAGE_AUTO" class="mt-1.5 text-[12px] text-muted">
    {{ t("settings.language.autoResolved", { locale: browserLanguageTag(), label: resolvedLabel }) }}
  </p>
  <p class="mt-3 text-[12px] text-muted">{{ t("settings.language.partial") }}</p>
</template>
