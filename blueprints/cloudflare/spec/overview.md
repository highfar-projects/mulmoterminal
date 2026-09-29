# {{appName}} — Cloudflare 構成（Workers + D1 + Vue）

> 設計図パック `cloudflare` の雛形から作った。`{{…}}` はヒアリングの答えで埋める。埋まらないものは `.blueprint/open-questions.md` へ。

## 動く場所

Cloudflare。公開した URL（`https://<名前>.<アカウント>.workers.dev` か、独自のドメイン）を知っていれば、誰でもインターネットから開ける。手元では `yarn start` で同じものを動かし、ブラウザで開いて確かめる。

| 部品 | 役割 |
|---|---|
| Cloudflare Workers（TypeScript） | API。`/api/*` |
| D1（SQLite） | データ。手元では `.wrangler/` の中、公開後は Cloudflare 上 |
| Vue 3 + Vite | 画面。ビルドしたものを同じ Worker が静的に配る |

## データ

{{tables}}

表ごとに「列・型・必須か・一意か」と、表どうしのつながりを書く。

## API

{{endpoints}}

操作ごとに「メソッドとパス・入力・返すもの・だれが呼べるか」を書く。公開すると誰でも呼べるので、「だれが呼べるか」は必ず書く。

## 画面

{{screens}}

## 決めていないこと

`.blueprint/open-questions.md` を参照。
