# 全文検索パネルの結果を読めるようにする (#2159)

#2140 で検索は動くようになったが、結果が読み取れない。四つの欠けを一つの PR で埋める。

## 1. 前後の行は grep ではなくファイルから読む

これが設計上の要。`git grep -C` は使わない。理由は #2159 に実測付きで書いたとおりで、要点だけ:

- `-z` を付けるとマッチ行と文脈行が同じ形になり区別できない。`-z` はパスに `:` が入りうるから
  選んだもので外せない。
- `--column` を足すとマッチ行だけフィールドが増えるが、NUL を git のバイナリ判定窓より後ろに
  置いたテキストファイル（`-I` では除外されない）で**文脈行がマッチ行に化け、先頭が欠ける**。

→ 検索パーサ (`server/files/file-search.ts`) には**一切触らない**。前後の行は独立した読み取りで得る。

これには副次的な利点がある。未保存バッファの前後は、そもそもディスクからは取れない。
窓の切り出しを `common/` の純粋関数にすれば、サーバはディスクに、ブラウザはバッファに
**同じ規則**を当てられる。`common/` に置く理由がこれ。

### `/browse/text` を流用しない

既存ルートは `storeBackup()` を呼ぶ。結果行を選ぶたびにバックアップが回ることになるので使わない。
新ルート `GET /api/files/browse/lines` を足し、封じ込め (`containedFor`) と
ガード (`readTextOr4xx`: ディレクトリ / サイズ上限 / 非可逆 UTF-8 / 404) だけを再利用する。

## 2. ハイライトの位置は正規表現で求めない

`common/fileSearch.ts` の `literalMatch` が記録しているとおり、クエリから組んだ RegExp を
UI スレッドで走らせるのは禁じ手。位置の走査も同じ制約下に置く — コード単位の逐次比較のみ。

**サーバの `-i` と JS の case fold は一致しない場合がある。** そのときは
「ハイライトが付かない」だけで、結果が消えたり別の行を指したりはしない。
最悪がハイライトの欠落で済むようにするのが狙いで、`literalMatch` には手を入れない
（別の fold を二つ持つことになるが、一致させに行って `matchesInBuffer` の挙動を
変えるほうが危ない）。

regex モードはハイライトも窓ずらしも無し。位置を安全に知る手段が無い。

## 3. ファイル構成

| ファイル | 中身 |
|---|---|
| `common/fileSearch.ts` | `lineWindow()` と `LineWindow` を追加。両側が同じ規則で窓を切る |
| `src/components/searchSnippet.ts` (新) | `literalMatchRanges()` と `snippetView()`。ブラウザ側の表示規則 |
| `src/composables/useSearchContext.ts` (新) | 選択行の前後を取る。デバウンス / abort / キャッシュ / バッファ短絡 |
| `server/files/files-browse.ts` | `/api/files/browse/lines` を追加 |
| `src/components/FileSearch.vue` | 描画。階層と件数サマリもここ |

`highlightParts` は `src/components/filePathMatch.ts` の既存物を使う。
FileFinder と同じ見た目になり、コード単位 vs コードポイントの罠 (#2102) も既に潰してある。

## 4. 窓ずらしの規則

マッチが行頭から一定文字数より後ろにあるときだけ、マッチの手前に少し文脈を残して切り、
先頭に省略記号を付ける。パネルの実幅は測らない — 定数で決め打ちして、切るかどうかだけを
マッチ位置で決める。こうすると純粋関数のままテストできる。

## 5. テスト

- `lineWindow`: ファイル先頭 / 末尾でのクランプ、`\r\n`、長い行のクリップ
- `literalMatchRanges`: 大文字小文字、smart case、複数出現、重なり、空クエリ、fold 不一致で空を返すこと
- `snippetView`: 切る / 切らない、範囲のずれ、省略記号
- `/api/files/browse/lines`: 実ファイルに対して。封じ込め、ディレクトリ、サイズ上限、行番号の境界
- `FileSearch.vue`: ハイライトが出ること、選択で前後が開くこと、未保存バッファはフェッチせずに開くこと

## 確認

`yarn format` → `yarn lint` → `yarn typecheck` → `yarn build` → `yarn test`。
見た目の変更なので**実ブラウザでの描画確認まで**行う（build 成功は描画の保証にならない）。
