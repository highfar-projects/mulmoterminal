# fix: a build does not start in, or write through, a .blueprint that is a link (#2510)

## 問題

ビルドを始めると、ホストが `.blueprint/answers.json` を書く（`writeFileAtomic`）。そのフォルダの `.blueprint` が別の場所へのリンクだと、書き込みがリンクをたどってフォルダの外に落ちる。git はリンクを持てるので、クローンしたリポジトリで始めるだけで起こりうる。

## 方針

- `recordFolderIsReal(projectDir)`（`server/blueprint/answersFile.ts`）: `.blueprint` が無いか、本物のフォルダ（lstat で dir）なら真。リンク・ファイル・調べられないもの（ENOENT 以外のエラー）は偽。
- 始めるとき: 偽なら新しい断り `record-folder-not-real`（5 言語）で断る。何も書かない。エージェント自身の書き込みはホストでは閉じ込められないが、始めなければそのフォルダではビルドが走らない。
- 工程ごとの `answers.json` の書き込み: 書く直前に同じことを確かめ、偽なら書かずに投げる。executor はこれを既存の `answers-unwritten` の通知で止める。確かめてから書くまでの間に差し替えられる隙は残る（ほかのホストの書き込みと同じ）。
