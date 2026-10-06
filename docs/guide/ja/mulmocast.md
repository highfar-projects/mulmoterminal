---
title: MulmoCast の動画 — Remotion の場面
nav_title: MulmoCast の動画
layout: default
parent: 日本語
nav_order: 24
description: MulmoCast の動画の場面を、Claude Code に Remotion のコンポーネントとして書かせます。自分で入れる任意のパッケージ、npx の更新で消えない入れ場所、動くかどうかの確かめ方。
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

- `image.prompt`（必須）— 場面で見せるもの。
- `image.fps`（任意）— 1〜60。省略すると 30。
- `remotionParams.brief`（任意）— すべての場面に共通する色・書体・雰囲気。場面どうしがひとつの動画としてそろいます。

場面の長さはナレーションの長さで決まります。詳しくは
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

### 3. Claude Code にログインしておく

場面を書くのは `claude -p` で、これを起動するのは **MulmoTerminal のサーバー**です。いま話しているセルではありません。
そのため、

- サーバーが動いているマシンで、`claude` が入っていてログイン済みである必要があります。
- サーバー自身のログイン（いつものログイン）で動きます。セルを[別の契約](accounts.html)で動かしていても変わらず、
  使用量もいつものログインに付きます。
- 1 つの場面で何回か呼びます。コンポーネントを書く、描画に失敗したら直す、描画したコマを見て良くする、の分です。
  1 場面に 1 分以上かかると考えてください。

### 4. 動画を作る

エージェントは、まだ自分から `remotion` の場面を提案しません。たとえば
「2 つ目のビートを remotion の場面にして: …」のように名前を出して頼むか、台本に自分で書き足してから、
いつもどおり GUI パネルで動画にしてください。

最初の描画のときだけ、Remotion が使うヘッドレスの Chrome（約 90 MB）がダウンロードされます。

Claude Code が書いたコードは、ビートの画像の隣の `<ビート>_remotion/<ハッシュ>.tsx` に残ります。
プロンプト・brief・ナレーションが変わらないかぎり、このコードが使い回されます。ナレーションの長さが変わっただけなら、
描画し直すだけです。

### 知っておくこと

- **書かれたコードは手元のマシンで動きます。** ネットワークに出られるヘッドレスのブラウザの中で動くので、
  `html_tailwind` の `script` と同じ扱いです。信頼できない台本は描画しないでください。
- 入れるとホームに `package.json` と `node_modules` ができます。ホームの下にある Node のプロジェクトは、
  自分で入れていないかぎり、**どれも**このパッケージを見つけるようになります。
- `remotion` のビートには `moviePrompt` を一緒に付けられません。
- GPU の無い Linux では、three.js の場面が WebGL を使えずに失敗することがあります。
