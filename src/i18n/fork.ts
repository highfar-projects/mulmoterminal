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

// The peer-server picker in the launch form (common/peers.ts). Fork-only while it is a prototype.
const peerMessages = {
  en: {
    paneActionOnPeer: "This acts on this machine, and the folder is on another server — not available there yet.",
    runOn: "Run on",
    thisServer: "This server",
    peerNote: "Runs on another MulmoTerminal server. The folders and sessions below are that machine's; type a path as it names it.",
  },
  ja: {
    paneActionOnPeer: "この操作はこのマシンで動くため、別のサーバーのフォルダではまだ使えません。",
    runOn: "実行先",
    thisServer: "このサーバー",
    peerNote: "別の MulmoTerminal サーバーで動かします。下のフォルダとセッションはそのマシンのものです。パスはそのマシンでの書き方で入力してください。",
  },
  ko: {
    paneActionOnPeer: "이 작업은 이 컴퓨터에서 동작하므로, 다른 서버의 폴더에서는 아직 쓸 수 없습니다.",
    runOn: "실행 위치",
    thisServer: "이 서버",
    peerNote: "다른 MulmoTerminal 서버에서 실행합니다. 아래 폴더와 세션은 그 컴퓨터의 것입니다. 경로는 그 컴퓨터의 표기로 입력하세요.",
  },
  "zh-CN": {
    paneActionOnPeer: "此操作在本机上进行，暂时不能用于另一台服务器上的文件夹。",
    runOn: "运行于",
    thisServer: "本服务器",
    peerNote: "在另一台 MulmoTerminal 服务器上运行。下面的文件夹和会话都属于那台机器；请按那台机器的写法输入路径。",
  },
  "zh-TW": {
    paneActionOnPeer: "此操作在這台機器上進行，暫時不能用於另一台伺服器上的資料夾。",
    runOn: "執行於",
    thisServer: "這台伺服器",
    peerNote: "在另一台 MulmoTerminal 伺服器上執行。下面的資料夾和工作階段都屬於那台機器；請依那台機器的寫法輸入路徑。",
  },
};

const forkTips = { en: forkTipsEn, ja: forkTipsJa, ko: forkTipsKo, "zh-CN": forkTipsZhCN, "zh-TW": forkTipsZhTW };

type Locale = keyof typeof restartHints;
type Bundle = { settings: { quit: object } };

const withFork = <B extends Bundle>(bundle: B, locale: Locale) => ({
  ...bundle,
  settings: { ...bundle.settings, quit: { ...bundle.settings.quit, restartHint: restartHints[locale] } },
  forkTips: forkTips[locale],
  peers: peerMessages[locale],
});

/** Upstream's bundles with this fork's messages added: the `forkTips` and `peers` sections and the restart hint. */
export const withForkMessages = <M extends Record<Locale, Bundle>>(messages: M) => ({
  en: withFork(messages.en, "en"),
  ja: withFork(messages.ja, "ja"),
  ko: withFork(messages.ko, "ko"),
  "zh-CN": withFork(messages["zh-CN"], "zh-CN"),
  "zh-TW": withFork(messages["zh-TW"], "zh-TW"),
});
