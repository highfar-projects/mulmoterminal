// Fork-only messages, laid over upstream's five bundles in index.ts rather than written into en.ts,
// ja.ts and the rest. Those files then stay exactly upstream's, so an upstream merge never has to
// carry the fork through them, and their line budget is upstream's alone (en.ts sits at its limit).
import { LAUNCH_COMMAND } from "../../common/launchCommand";
import { forkTipsEn } from "./forkTips/en";
import { forkTipsJa } from "./forkTips/ja";
import { forkTipsKo } from "./forkTips/ko";
import { forkTipsZhCN } from "./forkTips/zh-CN";
import { forkTipsZhTW } from "./forkTips/zh-TW";

// Settings → Quit's "how to start it again" names THIS fork's command, not upstream's
// `npx mulmoterminal@latest`. Each is a function, as upstream's is: that skips vue-i18n's message
// compiler, which reads an `@` in a message as a linked-message reference and throws.
const restartHints = {
  en: () => `To start it again, run \`${LAUNCH_COMMAND}\` in a terminal.`,
  ja: () => `もう一度起動するには、ターミナルで \`${LAUNCH_COMMAND}\` を実行してください。`,
  ko: () => `다시 띄우려면 터미널에서 \`${LAUNCH_COMMAND}\`를 실행하세요.`,
  "zh-CN": () => `要再次启动，请在终端里运行 \`${LAUNCH_COMMAND}\`。`,
  "zh-TW": () => `要再啟動一次，請在終端機裡執行 \`${LAUNCH_COMMAND}\`。`,
};

const forkTips = { en: forkTipsEn, ja: forkTipsJa, ko: forkTipsKo, "zh-CN": forkTipsZhCN, "zh-TW": forkTipsZhTW };

type Locale = keyof typeof restartHints;
type Bundle = { settings: { quit: object } };

const withFork = <B extends Bundle>(bundle: B, locale: Locale) => ({
  ...bundle,
  settings: { ...bundle.settings, quit: { ...bundle.settings.quit, restartHint: restartHints[locale] } },
  forkTips: forkTips[locale],
});

/** Upstream's bundles with this fork's messages added: the `forkTips` section and the restart hint. */
export const withForkMessages = <M extends Record<Locale, Bundle>>(messages: M) => ({
  en: withFork(messages.en, "en"),
  ja: withFork(messages.ja, "ja"),
  ko: withFork(messages.ko, "ko"),
  "zh-CN": withFork(messages["zh-CN"], "zh-CN"),
  "zh-TW": withFork(messages["zh-TW"], "zh-TW"),
});
