import type { Messages } from "./messages";

// 日本語。`Messages` は en.ts の形そのものなので、キーを一つ落とすと型エラーになる — 実行時に
// 英語へフォールバックして気づかない、という状態にはならない。
//
// セクション名（tabs.*）は英語のままのものがある。config.json のキー名や skill の名前と一対一で
// 対応していて、ガイドや README もその語で書かれているため、訳すと探し先が分かれる。
export const ja: Messages = {
  settings: {
    title: "設定",
    close: "閉じる",
    closeAria: "設定を閉じる",
    sectionsNav: "設定のセクション",
    sectionPicker: "設定のセクション",

    groups: {
      appearance: "表示",
      projects: "プロジェクト",
      launch: "ヘッダーと起動",
      input: "入力",
      models: "モデルとサーバ",
      notifications: "通知",
      integrations: "連携",
      sessions: "セッション",
      help: "ヘルプ",
    },

    tabs: {
      language: "言語",
      theme: "配色（テーマ）",
      font: "ターミナルのフォント",
      fontSize: "ターミナルの文字サイズ",
      scroll: "ターミナルのスクロール量",
      waitingRows: "待機中の行",
      dirAppearance: "ディレクトリの見た目",
      dirSettings: "ディレクトリ設定",
      launchers: "起動コマンド",
      headerChrome: "ヘッダーのボタンとチップ",
      terminalKeys: "ターミナルのキー",
      shortcuts: "キーボードショートカット",
      voice: "音声入力",
      models: "モデルとバックエンド",
      mcp: "MCP サーバ",
      sounds: "通知音",
      push: "Web Push 通知",
      quickCommands: "スマホの定型文",
      github: "GitHub と GitLab",
      prRepos: "プルリクエストのリポジトリ",
      google: "Google アカウント",
      sessions: "セッションとバックグラウンド処理",
      surviving: "再起動を生き延びたセッション",
      cost: "コスト（推定）",
      help: "ヘルプとユーザーガイド",
    },

    language: {
      intro:
        "このアプリ自身のボタンやラベルの言語です。配色と同じくブラウザごとに保存されるので、スマホと PC で別々にできます。エージェントが書く内容やターミナルの表示は変わりません。",
      picker: "このアプリの言語",
      auto: "ブラウザの言語にあわせる",
      autoResolved: "このブラウザは {locale} を要求しているので、{label} で表示されます。",
      partial: "いまのところ訳されているのは設定画面だけです。ほかの画面は英語のままです。",
    },
  },
};
