# Preview で読んでいた位置に戻る — sandbox を緩めずに (#2157)

## 問題

Files ペインの Markdown Preview だけが、開き直すと先頭に戻る。#2149 でエディタのカーソルと
ツリーのスクロールは戻るようになったが、Preview のスクロール位置は **観測する手段が無かった**。

封じ込めは二重で、どちらも独立に効く:

- `src/components/FilesPane.vue` の iframe 属性 `sandbox=""`
- `server/files/files-browse.ts` の `Content-Security-Policy: sandbox`

ディレクティブ無しの `sandbox` は文書を opaque origin に固定し、スクリプトも走らせない。
親から `contentWindow.scrollY` は読めず、中から報告することもできない。

そして同じ `/api/files/browse/md` は、ターミナル出力中の `.md` パスをクリックしたときの
**新しいタブ表示**にも使われている（`src/composables/terminalFilePathLinkProvider.ts`）。
中身は `marked.parse()` の出力そのもので、サニタイザは通っていない。sandbox がその封じ込めの本体。

## 採らなかった案

issue #2157 の A〜D を検討し、いずれも採らなかった。

- **B（見出しアンカーで近似）は目的を満たさない。** opaque かつスクリプト無しの iframe では、
  *Preview のスクロール位置そのものが観測できない*。B で復元できるのは「Preview に切り替えた
  時点のエディタの `topLine`」だけで、Preview を読みながらスクロールした位置は記録のしようが
  ない。加えて `marked` は見出し id を出力しない。
- **A（両方に `allow-same-origin`）** は実装が最小だが、サニタイズされていない `.md` を
  アプリと同一オリジンの文書にする。`allow-scripts` を足さないという運用上の約束が、
  Preview と新タブの両方に永続的に掛かる。
- **C（アプリ内描画）** は変更が最大で、封じ込めの判断を丸ごと DOMPurify に賭け替える。
  同時に解けるはずだった #2136 は既に別途解決済みで、C の利点は減っている。

## 採った案 — E: nonce 付きレポータ

`allow-same-origin` は与えない。opaque origin のまま、**自前のスクリプトだけ**を走らせる。

1. **ペインの iframe だけが `?embed=1` を付けて要求する**（`filesPreviewSrc.ts`）。
   新しいタブはこの引数を付けないので、その文書は**ヘッダも本文も今と同一**。
2. `embed=1` のとき、サーバは CSP を
   `sandbox allow-scripts; script-src 'nonce-<毎回新しい値>'` にし、
   その nonce を持つ小さなスクリプトを本文末尾に足す。
   - `script-src` に `'unsafe-inline'` が無いので、**ファイル側の `<script>` も
     `onerror=` もこれまでどおり実行されない**。nonce を持つのは自前の一本だけ。
   - `allow-same-origin` は無いままなので、文書は**永久にアプリのオリジンに入らない**。
     CSP を書き損じても同一オリジン化だけは起きない、という順序で守りを積む。
3. iframe 属性は `sandbox="allow-scripts"`。実効サンドボックスは属性と CSP の積なので、
   両方に `allow-scripts` が要る（そして両方に `allow-same-origin` が**無い**）。
4. スクリプトは `parent.postMessage` でスクロール位置を報告し、親からの復元要求を受ける。
   親は `event.origin`（opaque なので `"null"`）ではなく **`event.source === iframe.contentWindow`**
   で相手を確かめる。
5. 文書は読み込み直後に `ready` を投げ、**親がその返事として位置を送る**。
   load のタイミングを親が推測しないで済み、ファイルが外部で書き換わって
   iframe が読み直されたとき（`v=` が変わる）も、読んでいた位置に戻る。

## 位置が住む場所

`FilePlace`（`useOpenFile.ts`）に `previewScrollTop` を足す。カーソルと `topLine` と同じ値で、
同じ経路に乗る:

- スナップショット（`FilesPaneState`）に載り、ディレクトリごとに localStorage へ
- 別のファイルを開いたら捨てる（`staysOnSameFile` が false の側）
- 同じファイルの読み直しでは持ち越す

## 触るファイル

- `common/mdPreviewMessage.ts`（新規）— 両端が読む wire 定義と型ガード
- `server/files/mdPreviewEmbed.ts`（新規）— CSP 文字列とスクリプトタグを作る純粋関数
- `server/files/files-browse.ts` — `embed=1` のときだけ別の CSP と本文
- `src/components/filesPreviewSrc.ts` — `embed=1` を付ける
- `src/composables/useMdPreviewScroll.ts`（新規）— 親側の受け口
- `src/composables/useOpenFile.ts` / `src/components/filesPaneState.ts` / `src/components/FilesPane.vue`

## 確認

- 純粋関数の spec（CSP 文字列、スクリプトタグ、`embed` の判定、型ガード、URL）
- ルートの spec: `embed=1` の有無でヘッダと本文が切り替わること、
  **`embed=1` 無しの応答が今と一字一句同じ**であること
- 実機: 実際のサーバとブラウザで
  ①Preview をスクロールして別ファイル→戻ると位置が戻る
  ②`<script>` と `<img onerror=…>` を含む `.md` を Preview で開いても**何も実行されない**
  ③新しいタブ表示が今までどおり
