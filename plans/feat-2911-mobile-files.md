# 宣言したディレクトリのファイルをスマホから見る（ホスト側）

Issue: #2911（表示側は receptron/mulmoserver#343）

## いまある土台

- コマンドチャネル: `server/backends/remoteHost/handlers/index.ts` の表に足せばスマホから呼べる。
  投げたエラーの文言はそのままスマホに出る。
- プロジェクトの解決: `listCollectionProjects` と `../commandScope.ts` が `project?` を
  workspace / 登録ディレクトリに解決している。同じ定義を使う。
- 設定ファイル: `<project>/.mulmoterminal.json`（`repo.json → .mulmoterminal.json → .mulmoterminal.local.json`）。
  型と検証は `server/config/config-schema.ts`、読み込みは `server/config/dir-config.ts`。
- 閉じ込め: `server/config/dir-file.ts` の `resolveFileWithinDir`（相対のみ・字面・実在・realpath）。
  ディレクトリ版は無いので、同じ4段の規則でディレクトリを解決する関数を同じファイルに足す。
- ホスト → Storage の書き込み: `server/infra/shapescript-manage-tool.ts` の `uploadBytes`。
- 上限の考え方: `REMOTE_VIEW_MAX_BYTES`（`@mulmoclaude/core/remote-view`）。コマンド文書に載せる本文はこれ以下。

## 設定

```json
{ "mobileFiles": { "dirs": ["output"], "extensions": ["md", "html", "pdf", "png", "jpg"] } }
```

- 初期値なし。キーが無いプロジェクトは一覧に出ない（workspace も同じ）。
- `dirs`: プロジェクト相対のみ。外を指す・存在しない・ディレクトリでないものは捨てる。
- `extensions`: 先頭の `.` と大小を正規化し、ホストの許可リストとの共通部分だけ残す。
  許可リスト（`common/mobileFiles.ts` の定数）: md / html / htm / pdf / png / jpg / jpeg / gif / webp。
  svg はスクリプトを持てるので最初は入れない。
- 捨てた値は Settings の Directory settings の「検証で落ちたキー」に出る経路に乗せる。

## 変更

1. **`common/mobileFiles.ts`（純粋関数・新規）**
   - 許可拡張子の定数と、wire の型（`MobileFileEntry` / `MobileFileContent`）。
   - `normalizeMobileFilesConfig(raw)`: 設定値 → `{ dirs, extensions }` と捨てた値の一覧。
   - `isServableName(relativePath, extensions)`: 隠しファイル（どの階層でも `.` 始まり）を除外し、拡張子を判定。
2. **設定の取り込み** — `config-schema.ts` に `mobileFiles` の zod スキーマ、`dir-config.ts` で読み込み、
   ディレクトリの閉じ込めは `dir-file.ts` の新関数。
3. **一覧** — `server/backends/remoteHost/mobileFiles.ts`
   - 宣言ディレクトリを走査（深さと件数に上限、symlink は辿らない）、mtime の新しい順、`offset` / `limit`。
   - 返すのはメタデータだけ: `{ path, kind, bytes, modifiedAt }`。
4. **取得** — 同ファイル
   - 毎回、`path` を宣言ディレクトリのどれかに対して閉じ込め検査し、拡張子を再判定する。
     一覧に載っていたかどうかには頼らない（スマホが送る値は信用しない）。
   - md / html で本文が上限以下: `{ kind, inline: text }`。相対パスの画像は上限の残りの範囲で
     `data:` URL に埋め込み、収まらなかった数を `omitted` で返す。
   - それ以外: Storage `users/{uid}/downloads/{uuid}` に `uploadBytes` し、`{ kind, storagePath, bytes }` を返す。
5. **コマンド登録** — `handlers/index.ts` に `listMobileFiles` / `getMobileFile`。
6. **Settings** — Directory settings に「Phone files」の行を出す。編集フォームには載せない（ファイルだけで設定）。
7. **文書** — `docs/remote-host-protocol.md` のコマンド表と型、`docs/guide/{en,ja}/config.md` の
   プロジェクト設定、`decks` と同じく `server/skills/mulmoterminal-config` が持ち、`mulmoterminal-dirs` からは参照だけ。

## テスト

- `normalizeMobileFilesConfig`: 正常値 / 空 / 非配列 / 非文字列 / 外を指す値 / 許可外拡張子 / 大小・先頭ドット。
- `isServableName`: 隠しファイル（途中の階層含む）/ 拡張子なし / 二重拡張子 / 大小。
- ディレクトリの閉じ込め: `..` / 絶対パス / 中から外への symlink / 存在しない / ファイルを指す。
- `getMobileFile`: 宣言外のパス・許可外拡張子・symlink 経由を拒否、上限で本文と Storage を切り替え
  （Storage は差し替えて、API キー無しで動く）。

## 決めたこと

- 採用は「設定で宣言」。`present*` の記録・自動走査は採らない（理由は #2911）。
- mulmoterminal のみ。`@mulmoclaude/core` は変えない。
- 取りに行く方式のみ。先に送る・オフライン保持はやらない。

## Storage に置いた物は1時間で消す

基本は一覧だけを送り、スマホで選ばれたときに限って一時的に Storage へ置く。置いた物は見せるためだけのもので、残す理由が無い。

- 保持時間は定数 `MOBILE_FILE_TTL_MS`（1時間）。
- **ホストが消す**: アップロード時にタイマーで削除を予約する。
- **ホスト再起動の取りこぼし**: スマホが次に一覧を開くか取得したときに `users/{uid}/downloads/` を
  `listAll` で一覧し、`timeCreated` が保持時間を過ぎた物を消す（全件を一覧するので間隔を空けて実行）。
- **消し忘れ防止（必須）**: バケットのライフサイクル規則で `downloads/` を1日で自動削除する。
  ホストのタイマーと起動時の掃除はどちらもホストが動いていることが前提なので、それが崩れても
  1日を超えて残らないことはこの規則が保証する。ライフサイクル規則は日単位でしか指定できないため、
  1時間の削除はホスト側でやる。規則は mulmoserver#343 側で `cors.json` と同様にファイルとして持ち、
  `downloads/` を使う機能を出す前に適用しておく。
- 保持時間内に同じファイル（パスと mtime が同じ）がまた要求されたら、置いてある物を返して再アップロードしない。

## 他のユーザーから見えないこと

本人（同じ Google アカウント）以外が、一覧・中身・Storage の物のどれにも届かないことを守る。

- **コマンドチャネル**: 既存の `users/{uid}/hosts/...` を使う。`firestore.rules` で本人の uid に限定済みで、新しい経路は作らない。
- **Storage の規則**: `users/{uid}/downloads/{objectId}` は読む・一覧・書く・消すのすべてを
  `request.auth.uid == uid` に限定する。書き込みは許可した種類とサイズだけにする。
  それ以外は既存の「すべて拒否」に落ちる。
- **規則のテスト（mulmoserver#343）**: `test/rules/rules_shapes.ts` と同じ形で、別の uid と未ログインからの
  読む・一覧・書く・消すがすべて拒否されることを確かめる。
- **`getDownloadURL` は使わない**: これが返すのは、URL を知っていれば誰でも読めるトークン付き URL で、
  規則を素通りする。ホストは返さず、スマホは本人の認証で `getBlob` して手元で blob URL にする。
- **名前から中身が漏れないように**: オブジェクト名は乱数の UUID にし、元のパスやファイル名は Storage に
  書かない（再利用の対応表はホストのメモリに持つ）。`cacheControl` は `private, no-store`。
- **公開経路と混ぜない**: 共有アプリ（`sharedApp/`）や shapes のような公開読み取りの場所には一切置かない。
- **html の隔離を remote-view より強める**: 画像は `data:` に埋め込むので、`img-src` / `media-src` から
  `https:` を外し、`connect-src 'none'` と合わせて、表示中の html から外へ送る経路を塞ぐ。

## 未決（実装中に決める）

- 走査の深さ・件数の上限値（定数で持つ）。
- `storage.rules` の `downloads/` 追加は mulmoserver#343 側の変更で、手でデプロイする。
  ルールが入るまでは pdf / 画像の取得が失敗するので、その文言をスマホ向けに書く。
