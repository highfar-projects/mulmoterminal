# fix: an answer names a Markdown section by its heading, not by chaff's index (#2534)

## 問題

「文書に尋ねる」に Markdown の文書を読ませると、人が読む答え・replies.md・FAQ.md の「書いてある場所」が `h1.3「作業用フォルダを信頼しておく」` のように出る。`h1.3` は chaff の木の番地で、人には意味が無い。ask の検査が、答えの文に引用の `address` がそのまま入っていることを求めていたため。

## 方針

- `blueprints/docs/checks/places.mjs`: `headingsIn(tree)`（chaff の木の JSON から、節の番地と見出しの対応）、`headingsOf(file)`（`chaff tree --format json` を読む）、`namesPlace(text, address, heading)`。
- ask の検査は、答えの文が番地か、その番地の節の見出しを含めば通す。
  - 見出しを引くのは、引用元が名指しした文書のひとつのときだけ。
  - 番地がそのまま入っていれば、木は読まない。
- answer と keep の SKILL は次のようにする。
  - 人が読むもの（答え・replies.md・FAQ.md）では、節を見出しで「」に入れて名指しする。
  - 条や項は文書の番号のまま（第4条第2項）。
  - `h1.3` は `address` にだけ書く。
- 引用の `address` はこれまでどおり（`chaff cite` が使う）。

## 範囲外（次の PR）

- 承認のときに読む画面用のファイル（verify の facts.txt、review の findings.txt）も、引用の場所を `trip.md h1` のように番地で出している。同じ種類の問題なので、`headingsOf` を使って見出しで出すよう続けて直す。
