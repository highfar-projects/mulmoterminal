# fix: gate views name places the way the document does (#2547)

## 問題

承認のときに読む review の findings.txt と verify の facts.txt が、引用の場所を chaff の番地のまま出していた（`contract.txt 4.2`、`trip.md h1`）。#2539 で「文書に尋ねる」の答えは見出しで名指しするようにしたが、こちらは残っていた。

## 方針

- `placeNamesIn(tree)` / `placeNamesOf(file)` / `placeNamer(sourcePath)`（`blueprints/docs/checks/places.mjs`）で、番地を人の読める名前にする。
  - 条・節は、ラベル（第4条、Section 3.2）か、ラベルが無ければ見出しを「」に入れたもの（Markdown の節）。
  - その下の項目は、ラベルを足す（第4条 ２、Section 3.2 (a) (i)）。
  - 木が読めないとき、名前が無いとき、引用元が名指しした文書でないときは、番地をそのまま出す。
- `factsText` と `findingsText` は `placeOf(source, address)` を受け取る（無ければ番地のまま）。書き出す検査が、名指しした文書から namer を作って渡す。
- review と verify の報告の SKILL で「場所（番地）」と書いていたのを、「文書の言い方で（第4条第2項、見出しを「」で）、chaff の番地（4.2、h1.3）ではなく」に直した。

## 実機

終わったビルドのフォルダで、本物の chaff 0.13 で二つの検査を回し直した。
- `itaku-keiyaku-2`: findings.txt が `contract.txt 第4条 ２`、`第2条 二` と出た。
- `osaka-kyoto-2`: facts.txt が `itinerary.md 「1日目 10月1日（金）」` と出た。

## わかっている制限

日本の契約の項は「第4条 ２」と出る（「第4条第2項」ではない）。chaff の木は項と号を同じ `item` にし、ラベルは「２」「二」だけなので、条・項・号の数え方をここで持たない限り組み立てられない。
