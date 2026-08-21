# ローンチデモ動画を README とユーザーガイドに載せる

Issue: #1827

## 背景

英語圏ローンチ（Hacker News への Show HN 投稿）の投稿リンクはこのリポジトリで、HN から来た読者が最初に見るのは README になる。現状 README の視覚要素は `hero.gif` だけで、ローンチ動画（並列で動いている複数エージェントの状態が一目で分かる、を 90 秒で見せるもの）が入っていない。

動画は 2 本とも作成・アップロード済み。

| 版 | 長さ | サイズ | 解像度 |
|---|---|---|---|
| 英語 | 91.6 s | 3.3 MB | 1280x720 h264 High + aac LC |
| 日本語（ナレーションのみ日本語・画面は英語版と同一） | 93.5 s | 3.4 MB | 同上 |

## 公開アクセスの確認（実施済み）

issue #1827 が投稿されたことで user-attachments の 2 URL は公開になった。未ログイン（Cookie なし）の `curl` で両方 302 → 署名付き S3 URL を返し、実体を取得して `ffprobe` が上表のとおりに読めることまで確認した。README にはこの URL をそのまま貼る。

## 置き場所の方針

**README = user-attachments の URL を 1 行。** GitHub は README 内の user-attachments URL をインラインの `<video>` として描画する。リポジトリに mp4 を持たなくてよく、`package.json` の `files` は `docs/` を含まないので npm の tarball にも影響しない。

**ガイド = リポジトリにコミットして相対参照。** user-attachments の URL は署名付き S3 URL への 302 で（署名の寿命は 5 分。リダイレクトはリクエストのたびに発行し直されるので、Range リクエストも含めて今日は素の `<video src>` から再生できることを確認した）、GitHub が文書化していない内部エンドポイントに依存する。ガイドは長く残るページなので、`docs/guide/videos/` に mp4 をコミットして Pages 自身に配らせ、各言語の index から `../videos/…` で参照する。

## 変更

1. **`README.md`** — 既存の `hero.gif` の直前に `## Demo` の見出しを置き、直下に英語版の URL を 1 行貼る。見出しがあることで Show HN のコメント等から `#demo` アンカーで直接誘導できる。`hero.gif` は残す: 動画のポスターフレーム（0 秒目）は単一セルの静止画で、gif が持っている「グリッドが色を変えながら動く」第一印象を代替しない。静止したポスター + 再生ボタンの下で gif がループする形になる。
2. **`docs/guide/videos/`** を新設し、英語版・日本語版の mp4 をコミットする。何をどう撮ったかの inventory として `README.md` を同梱（`images/README.md` と同じ役割）。コミットするのは添付そのままではなく `ffmpeg -c copy -movflags +faststart` でリマックスしたもの — 元のファイルは `moov` が末尾にあり、ブラウザが最初のフレームを描くのに末尾への Range リクエストを 1 往復余計に要する。無劣化で、ストリーム・フレーム・バイト数は同じ（デコード後の framehash の一致を確認済み）。
3. **`docs/guide/en/index.md` / `docs/guide/ja/index.md`** — 最新リリースのバナーの直後、「はじめての方へ」の直前に `<video>` を置く。バナーより上には置かない: CLAUDE.md のリリース手順が「index はこのバナーで始まる」と定めているため。
4. **`.gitattributes`** — `*.mp4 binary` を追加する。既存の binary 指定は png / jpg / gif / ico / woff だけで、mp4 が入っていない。

## 確認したこと

- 2 URL が未ログインで取得できること（上記）
- 動画に maintainer のディレクトリ・アカウント名が写っていないこと。13 フレームのコンタクトシートで通し確認した。デモ用の `HOME` とデモ用プロジェクト（`acme-*`）で撮られている
- ガイドから追加した相対参照（`../videos/launch-demo-{en,ja}.mp4`、`../images/README.md`）がすべて実在のファイルに解決すること
- コーデックがブラウザの共通線であること（h264 High / yuv420p / level 3.1 + AAC-LC 44.1 kHz stereo）
