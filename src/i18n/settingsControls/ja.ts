export const settingsControlsJa = {
  defaultAgent: {
    title: "既定のエージェント",
    hint: "新しいセルの起動フォームで、そこで選ぶまで最初に選ばれているエージェント。MulmoTerminal が起動するときにインストールされているかを確かめるのもこのエージェントです。",
    field: "既定のエージェント",
    unset: "未設定（Claude）",
    notInstalled: "{agent}（インストールされていません）",
    overridden: "保存しました。今回は --agent 付きで起動しているため、それを付けずに起動するまではそちらが優先されます。",
  },
  headerTint: {
    title: "ヘッダーの状態色",
    hint: "セッションが動いている・終わったことを、ターミナルのヘッダーでどう見せるか。ディレクトリごとには .mulmoterminal.json で変えられます。",
    field: "ヘッダーの状態色",
    tints: {
      background: "ヘッダーを状態の色で塗る",
      none: "ディレクトリの色のまま（状態は枠・点・ラベルで示す）",
    },
  },
  headerColors: {
    title: "状態ごとのヘッダーの色",
    hint: "すべてのターミナルのヘッダーで、状態ごとにテーマの色を置き換えます。ディレクトリの .mulmoterminal.json に書いた色は、そのディレクトリでこの組ごと置き換えます。",
    statuses: {
      working: "実行中",
      done: "完了",
      blocked: "入力待ち",
    },
    background: "背景",
    text: "文字",
    theme: "テーマの色",
    auto: "自動",
    autoState: "自動（読める色）",
    partOf: "「{status}」の{part}",
    reset: "テーマに戻す",
  },
  configReload: {
    button: "設定ファイルを読み直す",
    tip: "手やエージェントで ~/.mulmoterminal/config.json を書き換えた後に読み直します。反映のため、このページを再読み込みします。",
  },
  playful: {
    title: "ちょっとした演出",
    hint: "ときどき、ターミナルに何かが起きます。オフにすると、どのターミナルも静かなままです。",
    field: "ちょっとした演出",
  },
};
