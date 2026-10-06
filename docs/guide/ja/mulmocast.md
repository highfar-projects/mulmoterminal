---
title: MulmoCast の動画 — Remotion の場面
nav_title: MulmoCast の動画
layout: default
parent: 日本語
nav_order: 24
description: MulmoCast の動画の場面を、Claude Code に Remotion のコンポーネントとして書かせるか、自分で書いたコンポーネントを渡します。自分で入れる任意のパッケージ、npx の更新で消えない入れ場所、動くかどうかの確かめ方。
---

# MulmoCast の動画
{: .no_toc }

GUI パネルは、エージェントが書いた MulmoCast の台本（mulmoScript）を表示し、スライドや動画にします。
このページは、そのうち先に何かを入れておく必要がある機能をまとめています。

1. TOC
{:toc}

## Remotion の場面 {#remotion}

mulmocast 2.13.0 から、ビートを **`remotion` の場面**にできます。場面で見せたいものを文章で書くと、
Claude Code がそれを [Remotion](https://www.remotion.dev) のコンポーネントとして書き、MulmoCast がビートの
動画に描画します。動き、SVG のパス、3D（three.js）、ノイズ、シェーダーの効果まで使えます。
2.14.0 からは、出来上がったコンポーネントをそのまま渡すこともできます（[5.](#remotion-code)）。

<video controls playsinline muted preload="metadata" poster="../videos/v9.0.0-remotion-poster.png" style="width: 100%; max-width: 900px; border-radius: 6px;">
  <source src="../videos/v9.0.0-remotion.mp4" type="video/mp4">
  <a href="../videos/v9.0.0-remotion.mp4">例の二つの場面を見る（MP4）</a> — このブラウザではその場で再生できません。
</video>

*GUI パネルから作った二つの場面。言葉の周りに円が描かれ、続いて三枚のカードが矢印でつながります（10 秒、音声なし）。*

```json
{
  "remotionParams": { "brief": "深い紺の背景、オフホワイトの文字、強調色はシアン一色。" },
  "beats": [
    {
      "text": "この場面で読み上げるナレーション。",
      "image": {
        "type": "remotion",
        "prompt": "中央にタイトルが現れ、その下に3つの箱が左から順に現れて矢印でつながる。",
        "fps": 30
      }
    }
  ]
}
```

- `image.prompt` — 場面で見せるもの。`image.code` とどちらか一方を書きます。
- `image.code` — プロンプトの代わりに渡す、出来上がったコンポーネント（[5.](#remotion-code)）。
- `image.fps`（任意）— 1〜60。省略すると 30。
- `remotionParams.brief`（任意）— すべての場面に共通する色・書体・雰囲気。場面どうしがひとつの動画としてそろいます。

場面の長さはナレーションの長さで決まります。ビートに `duration` を指定してそれより長くした場合は、そちらになります。詳しくは
[mulmocast の remotion.md](https://github.com/receptron/mulmocast-cli/blob/main/docs/remotion.md) を見てください。

### 1. パッケージをホームに入れる

これらは mulmocast の任意のパッケージで、**MulmoTerminal は入れません**。この場面を使いたい人だけが入れます。
入れる場所は**ホームディレクトリ**です。

```bash
cd ~
npm install remotion @remotion/bundler @remotion/renderer react react-dom \
  @remotion/three three @react-three/fiber @remotion/effects @remotion/paths @remotion/noise \
  @remotion/shapes @remotion/transitions @remotion/motion-blur @remotion/layout-utils
```

ホームに入れる理由: `npx mulmoterminal@latest` はアプリを `~/.npm/_npx/` の下のフォルダに置き、このフォルダは
版が変わるたびに作り直されます。アプリの隣に入れたパッケージは、次の更新で消えてしまいます。Node は親のフォルダの
`node_modules` を順にたどって探すので、`~/node_modules` ならどの版からも見つかります。

### 2. MulmoCast から見えるか確かめる

```bash
npx mulmoterminal@latest init
```

確認の一覧に次の行が出れば入っています。

```
  ✓ remotion — Remotion scenes in MulmoCast videos
```

`○ remotion — optional` は一つも見つからなかったという意味です。`installed only in part; missing: …` には、
まだ入っていないパッケージの名前が出ます。

### 3. `prompt` の場面では、Claude Code にログインしておく

`code` を渡す場面では、この手順は要りません。`prompt` の場面を書くのは `claude -p` で、これを起動するのは **MulmoTerminal のサーバー**です。いま話しているセルではありません。
そのため、

- サーバーが動いているマシンで、`claude` が入っていてログイン済みである必要があります。
- サーバー自身のログイン（いつものログイン）で動きます。セルを[別の契約](accounts.html)で動かしていても変わらず、
  使用量もいつものログインに付きます。
- 1 つの場面で何回か呼びます。コンポーネントを書く、描画に失敗したら直す、描画したコマを見て良くする、の分です。
  1 場面に 1 分以上かかると考えてください。

### 4. 動画を作る

エージェントは、頼まれたときだけ `remotion` の場面を使います。パッケージが入っているかどうかを知るすべがないためです。たとえば
「2 つ目のビートを remotion の場面にして: …」のように名前を出して頼むか、台本に自分で書き足してから、
いつもどおり GUI パネルで動画にしてください。

最初の描画で、Remotion が使うヘッドレスの Chrome（約 90 MB）がダウンロードされます。置き場所は、
サーバーが動いているフォルダの `node_modules/.remotion`、つまり MulmoTerminal 自身のインストール先です。
そのため、**MulmoTerminal を更新するたびに、最初の描画でもう一度ダウンロードされます**（`npx` では版ごとに別のフォルダになるため）。
何もする必要はありませんが、更新のあと一回は待ち時間があると考えてください。

Claude Code が書いたコードは、ビートの画像の隣の `<ビート>_remotion/<ハッシュ>.tsx` に残ります。
コードを書くときに使ったもの（プロンプト、ナレーションの文面、brief、動画の中での場面の位置、画面の大きさと fps）が
変わらないかぎり、このコードが使い回されます。どれかが変わると（前にビートを足した場合も含めて）、場面は書き直されます。
音声の長さだけが変わったとき（声や速さを変えたとき）は、Claude Code に頼まず、同じコードで描画し直すだけです。

### 5. 出来上がったコンポーネントを渡す（`code`） {#remotion-code}

mulmocast 2.14.0 から、`remotion` のビートにコンポーネントそのものを書けます。MulmoCast はそれをそのまま描画し、
**`claude -p` を呼びません**。サーバー側で Claude Code にログインしている必要もなく、場面を書くための料金もかかりません。
`.tsx` はあなた（またはセルのエージェント）が書き、台本からはそのファイルを指します。

```json
"image": { "type": "remotion", "code": { "kind": "path", "path": "scenes/intro.tsx" }, "fps": 30 }
```

- `kind: "path"` — ファイルで渡します。場所は台本のフォルダからの相対パスです。`kind: "text"` — コードを `"text"` に直接書きます。
- コンポーネントは場面を `export default` し、**1 つのファイルで完結**させてください。描画の前に作業用のフォルダへ写すので、相対パスの import は解決できません。
- 書き直し・修正・見た目の点検は行いません。描画に失敗すると、ファイル（直接書いた場合はどのビートか）とエラーを示して止まります。直してから描画し直してください。
- 長さは `prompt` の場面と同じで、ナレーションの長さか、それより長い `duration` です。

コンポーネントが守るべき書き方（使ってよい import、動きをすべて今のコマから作ること、大きさを画面に対する割合で決めることなど）は、
[mulmocast の remotion.md](https://github.com/receptron/mulmocast-cli/blob/main/docs/remotion.md) にあります。
エージェントに場面を書かせるときは、このページを読むよう伝えてください。

### 知っておくこと

- **場面のコードは手元のマシンで動きます。** Claude Code が書いたものも、`code` で渡したものも同じです。
  ネットワークに出られるヘッドレスのブラウザの中で動くので、`html_tailwind` の `script` と同じ扱いです。信頼できない台本は描画しないでください。
- 入れるとホームに `package.json` と `node_modules` ができます。ホームの下にある Node のプロジェクトは、
  自分で入れていないかぎり、**どれも**このパッケージを見つけるようになります。
- `remotion` のビートには `moviePrompt` を一緒に付けられません。
- GPU の無い Linux では、three.js の場面が WebGL を使えずに失敗することがあります。
