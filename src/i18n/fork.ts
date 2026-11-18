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
    restartOnPeer: "Restarting an agent on another server is not supported yet. Close the cell and start it again there.",
    runOn: "Run on",
    thisServer: "This server",
    peerNote: "Runs on another MulmoTerminal server. Type the folder as that machine names it; its saved folders and past sessions are not listed here yet.",
    shellOnPeer: "A shell cannot run on another server yet. Pick an agent, or switch back to this server.",
  },
  ja: {
    restartOnPeer: "別のサーバーのエージェントは、まだ再起動できません。セルを閉じて、もう一度そこで起動してください。",
    runOn: "実行先",
    thisServer: "このサーバー",
    peerNote:
      "別の MulmoTerminal サーバーで動かします。フォルダはそのマシンでのパスで入力してください。そのマシンの保存済みフォルダや過去のセッションは、まだここに出ません。",
    shellOnPeer: "シェルはまだ別のサーバーでは動かせません。エージェントを選ぶか、実行先をこのサーバーに戻してください。",
  },
  ko: {
    restartOnPeer: "다른 서버의 에이전트는 아직 다시 시작할 수 없습니다. 셀을 닫고 그곳에서 다시 시작하세요.",
    runOn: "실행 위치",
    thisServer: "이 서버",
    peerNote: "다른 MulmoTerminal 서버에서 실행합니다. 폴더는 그 컴퓨터의 경로로 입력하세요. 그쪽의 저장된 폴더와 지난 세션은 아직 여기에 표시되지 않습니다.",
    shellOnPeer: "셸은 아직 다른 서버에서 실행할 수 없습니다. 에이전트를 고르거나 이 서버로 되돌리세요.",
  },
  "zh-CN": {
    restartOnPeer: "暂时无法重启另一台服务器上的智能体。请关闭该单元格，再在那里重新启动。",
    runOn: "运行于",
    thisServer: "本服务器",
    peerNote: "在另一台 MulmoTerminal 服务器上运行。请按那台机器上的路径输入文件夹；它保存的文件夹和过去的会话暂时不会列在这里。",
    shellOnPeer: "暂时无法在另一台服务器上运行 Shell。请选择一个智能体，或改回本服务器。",
  },
  "zh-TW": {
    restartOnPeer: "暫時無法重新啟動另一台伺服器上的代理。請關閉該儲存格，再在那裡重新啟動。",
    runOn: "執行於",
    thisServer: "這台伺服器",
    peerNote: "在另一台 MulmoTerminal 伺服器上執行。請依那台機器上的路徑輸入資料夾；它儲存的資料夾和過去的工作階段暫時不會列在這裡。",
    shellOnPeer: "暫時無法在另一台伺服器上執行 Shell。請選擇一個代理，或改回這台伺服器。",
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
