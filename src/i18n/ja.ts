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

    launchers: {
      intro:
        "グリッドのセルで動かせる対話コマンドなら何でも — 開発サーバ、REPL、git の UI、モデルのブリッジなど。セルのディレクトリで、書いたとおりのコマンドが永続ターミナルとして動きます。例: {labelExample} → {commandExample}。",
      notAnAgent:
        "Claude / Codex / Antigravity を起動したいときは、空のセルの Agent Picker を使ってください。ランチャではセッションに必要なものが何も付きません。",
      labelField: "ランチャのラベル",
      labelPlaceholder: "ラベル",
      commandField: "ランチャのコマンド",
      commandPlaceholder: "コマンド（例: $SHELL）",
    },

    quickCommands: {
      intro:
        "よく送る言い回しを、スマホのターミナル表示にチップとして並べます。タップすると入力欄に入るだけで、送信ボタンを押すまで送られません。ラベルはチップの見た目なので短くしてください。例: {labelExample} → {textExample}。どれもチェックしなければ全種類に出ます。合うものだけチェックすることもできます — {gitStatus} はシェル用で、Claude 用ではありません。",
      labelField: "定型文のラベル",
      labelPlaceholder: "ラベル",
      textField: "定型文の本文",
      textPlaceholder: "入力欄に入れる文字列（例: PR作って）",
      offerTo: "出す相手:",
      offerToAgent: "{agent} のセッションに出す",
      offerToNone: "（未チェック = 全種類）",
    },

    mcp: {
      intro:
        "{singleView}の Claude セッションが読み込む HTTP MCP サーバです（組み込みの GUI ツールに加えて）。{idKey} がサーバ名、{urlKey} が streamable-HTTP のエンドポイント。Docker サンドボックスでは {localhost} の URL は自動的に {dockerHost} 経由になります。次の Claude セッションから有効になります。",
      singleView: "単一ビュー",
      idField: "MCP サーバの id",
      idPlaceholder: "id（例: weather）",
      urlField: "MCP サーバの URL",
      urlPlaceholder: "https://… または http://localhost:PORT/mcp",
    },

    headerChrome: {
      intro:
        "ターミナルのヘッダーに並ぶ操作ボタンと表示チップです。グローバルには{buttons}・{chips}があります。プロジェクト側は自分の {dirFile} で id 単位に追加・置換できるので、実際に出るのは両者をマージしたものです。",
      builtInButtons: "組み込みのボタン",
      noButtons: "ボタンなし（すべて削除済み）",
      someButtons: "ボタン {count} 個",
      builtInChips: "組み込みのチップ",
      noChips: "チップなし（すべて削除済み）",
      someChips: "チップ {count} 個",
      setUp: "ヘッダーのボタンを設定する…",
    },

    models: {
      intro:
        "セッションを動かせる Anthropic 互換のバックエンドです（{configFile} の {providersKey} から）。ディレクトリごとに {dirFile} の {providerKey} / {modelKey} で固定できます。API キーは環境変数に置き、設定ファイルには書きません。",
      modelCount: "モデル {count} 個",
      keyIn: "キーは {env}",
      notReady: "使用不可",
      notInPicker: "ピッカーに出ません",
      ready: "使用可",
      noProviders: "未設定 — セッションは組み込みの既定で動きます。",
      customTitle: "自分のやり方で Claude Code を起動する",
      customIntro:
        "— Claude / Codex / Antigravity / Shell と並んで Agent Picker に出ます。ランチャではありません: Claude Code 自身の引数がコマンドの後ろに付くので、他の Claude セッションと同じように再開・コスト表示・GUI ツールが効きます。",
      noCustomAgents: "未設定。",
      addBackend: "バックエンドを追加する…",
    },

    common: {
      add: "追加",
      remove: "{name} を削除",
    },

    dirAppearance: {
      intro:
        "{skill} スキルを起動すると、ディレクトリの見た目と並び — 名前バッジ、アイコン、色、ターミナルのパレット、グリッド上の位置 — を設定できます。実際に開いているディレクトリを起点に、既存の設定を読み、まだ何も無いものにも同じ流儀で付けます。",
      configure: "見た目を設定する…",
      favicon: "プロジェクト自身の favicon を使う",
      faviconHint:
        "{iconKey} を設定していないディレクトリは、そのリポジトリが既に持っている画像（{svg}、{png}、web manifest）を表示します。要らないプロジェクトは自分の {dirFile} に {iconFalse} と書きます。こちらの設定はそれを上書きしません。",
    },

    dirSettings: {
      intro:
        "各ディレクトリの {dirFile} が実際に何をしているか。行を開くと、効いている値と、アプリが捨てたキー・認識しないキーが見えます。効かなかった設定は、これを見るまでは「そもそも書いていない」のと見分けが付きません。",
      outro: "ここに出るのは「どこがおかしいか」です。スキルは同じものを読んで理由を説明し、直すか、そのキーを持つスキルへ案内します。",
      explain: "設定を説明してもらう…",
    },

    google: {
      intro:
        "Google アカウントを連携すると、{tool} ツールとスマホから{calendar}の予定を読み書きできます。サインインは新しいタブで開き、{thisMachine}で完了するので、ここのブラウザを使ってください。リモート接続越しなら代わりに {cli} を実行します。この連携は MulmoClaude と共有されます。",
      calendar: "カレンダー",
      thisMachine: "このマシン",
      checking: "確認中…",
      pending: "ブラウザでの許可を待っています…",
      linked: "連携済み",
      notLinked: "未連携",
      signIn: "Google でサインイン",
      unlink: "連携を解除",
      confirmUnlink: "この Google アカウントの連携を解除しますか？ もう一度サインインするまで、MulmoTerminal はカレンダーにアクセスできなくなります。",
      secretMissing:
        "~/.secrets に OAuth のクライアントシークレットが見つかりません。デスクトップ クライアントの client_secret_*.json をそこに置くとサインインできます。使えるなら GCP 設定不要のブローカー連携でも構いません。",
      secretAmbiguous: "~/.secrets に client_secret_*.json が複数あります。1 つだけ残してください。",
    },

    prRepos: {
      intro: "横断{view}ビューが open な PR を一覧するリポジトリです。{gh} のログインを使います。形式は {format}。",
      view: "プルリクエスト",
      field: "リポジトリを追加（owner/repo）",
    },

    stepper: {
      decrease: "{label}を減らす",
      increase: "{label}を増やす",
    },

    theme: {
      missing: "選択中のテーマ {id} が定義されていません。{configFile} の {themesKey} に追加するか、下から選んでください。それまで選択は保持されます。",
      intro:
        "あるものから選びます。自作の配色は {configFile} の {themesKey} に置くと、組み込みの 4 つの隣に出ます。スキルはパレット・写真・ブランドカラーから配色を書き起こし、コントラストも確認します。",
      group: "テーマ",
      create: "テーマを作る…",
    },

    font: {
      intro:
        "すべてのターミナルが使う CSS の font-family スタックです。CJK の表示が崩れるとき（先頭のフォントに日本語グリフが無いと文字単位でフォールバックし、行が揃わなくなります）はここを直します。空欄なら組み込みのスタック。ディレクトリごとに {dirFile} の {key} で固定できます。",
      field: "ターミナルの font-family スタック",
      apply: "適用",
      invalid:
        "フォントスタックとして解釈できません。名前はカンマ区切りで — {example}。CSS の構文文字や閉じていない引用符は拒否します。1 つ壊れているだけで宣言全体が無効になるためです。",
      hint: "適用した瞬間に開いているターミナルが再フィットします — フォントが変われば文字送り幅も変わり、そのままではグリッドがキャンバスとずれるためです。総称ファミリを書かなかった場合は {mono} が末尾に足されるので、どれにも一致しないスタックでも等幅にフォールバックします。",
    },

    fontSize: {
      stepper: "ターミナルの文字サイズ",
      hint: "このブラウザのすべてのターミナルに適用されます。ディレクトリごとに {dirFile} の {key} で固定できます。",
    },

    scroll: {
      stepper: "ターミナルのスクロール量",
      hint: "ホイール 1 ノッチ、あるいはトラックパッドの 1 スワイプでターミナルがどれだけ動くか（1× が既定）。Mac のトラックパッドの 2 本指スクロールで読んでいた場所を通り過ぎてしまうなら下げてください。ブラウザごとの設定で、シェルのスクロールバックにも Claude Code のような全画面アプリにも効きます。",
      returnLabel: "送信したら最新の出力に戻る",
      returnHint:
        "Enter（や送信ボタン）を押すと、スクロールして上を見ていたターミナルが普通のターミナルと同じように一番下へ戻ります。シェルは元からこの挙動ですが、Claude Code のような全画面エージェントは自前でスクロール位置を持つため戻りません。この設定はそのスクロールをちょうど巻き戻します。ターンの実行中も読んでいる場所に留まりたいならオフにしてください。",
    },

    waitingRows: {
      intro:
        "拡大したセルの横に出る一覧で、エージェントが{waiting}行 — 権限の確認や質問 — は琥珀色のリングが付いて点滅します。単に{finished}行は緑で静止します。オフにすると色はそのままで動きだけ止まります。OS が「視差効果を減らす」設定のときは元から点滅しません。",
      waiting: "あなたを待っている",
      finished: "終わっただけの",
      blink: "待っている行を点滅させる",
      linesTitle: "1 行あたりの行数",
      linesHint: "各行をどこまで表示してから打ち切るか。増やすほど 1 つを読みやすくなり、画面に収まるセッション数は減ります。",
      fields: {
        summary: "サマリ",
        prompt: "あなたの入力",
        response: "直近の返信",
      },
      steppers: {
        summary: "サマリの行数",
        prompt: "あなたの入力の行数",
        response: "直近の返信の行数",
      },
    },

    cost: {
      intro:
        "{pricing}（入力・出力・キャッシュのトークン）から算出した、このプロジェクトの推定額です。実際の請求とは異なることがあり、定額プラン（Max）の利用は反映されません。Today / Month はこのプロジェクトのセッションを合算します。",
      pricing: "公開されているモデル別価格",
      group: "推定コスト",
      groupTitle: "公開されているモデル別価格からの推定です。実際の請求とは異なることがあります。",
      session: "セッション",
      today: "今日",
      month: "今月",
      failed: "コストの推定を読み込めませんでした。",
      unpriced: "価格が分からないモデルを使ったターンがあり、この推定からは除外されています。",
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
