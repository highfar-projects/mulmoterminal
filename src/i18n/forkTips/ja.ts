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
  restart: {
    button: "MulmoTerminal を再起動",
    description: "サーバーを止めて、もう一度起動します。ターミナルは tmux 上で動いているので元のまま戻り、サーバーが応答したらこのページも読み直されます。",
    descriptionRelaunch:
      "サーバーを止めて、起動コマンドからもう一度起動します。このとき最新の版が取得されます。ターミナルは tmux 上で動いているので元のまま戻り、サーバーが応答したらこのページも読み直されます。",
    relaunchHint: "同じ版のまま再起動します。再起動のときに新しい版を取得するには、フォークの README にある再起動ループから MulmoTerminal を起動してください。",
    failed: "サーバーに再起動を頼めませんでした。サーバーはまだ動いていますか？",
    restartingTitle: "MulmoTerminal を再起動しています…",
    restartingBody: "サーバーが戻ったら、このページは自動で読み直されます。",
    restartingBodyRelaunch: "最新の版を取得して起動しています。サーバーが戻ったら、このページは自動で読み直されます。",
    slow: "時間がかかっています。MulmoTerminal を起動したターミナルを確認してください。インストールがまだ続いているか、エラーで止まっている可能性があります。",
    updateButton: "再起動して更新",
  },
};
