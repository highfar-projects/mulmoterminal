import type { forkTipsEn } from "./en";

type Tree<T> = { [K in keyof T]: T[K] extends string ? string : Tree<T[K]> };

export const forkTipsJa: Tree<typeof forkTipsEn> = {
  reconnect: "このセッションに再接続",
  renameSession: "このセッションの名前を変更",
  renameSessionNamed: "セッション {title} の名前を変更",
  deleteSession: "このセッションを完全に削除",
  deleteSessionNamed: "セッション {title} を完全に削除",
  launchConfigMenu: ".vscode/launch.json の構成を空いているターミナルで実行",
  switchToStack: "カード重ね表示に切り替え",
  switchToGrid: "タイル表示に切り替え",
  devcontainer: {
    building: "devcontainer をビルド中…（{seconds} 秒）",
    stopping: "devcontainer を停止中…",
    fixing: "Claude Code の設定の永続化を修正中…",
    copied: "コピーしました",
    runningNamed: "このディレクトリの devcontainer（{name}）で実行中 — クリックでコピー",
    running: "このディレクトリの devcontainer で実行中",
    available: "このディレクトリには devcontainer があります — クリックでビルドして起動",
    rebuild: "このディレクトリの devcontainer を再ビルド",
    stop: "このディレクトリの devcontainer を停止",
    fixPersistence: "ここでは再ビルドで Claude Code の設定が失われます — クリックで修正",
  },
};
