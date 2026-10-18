# fix: files-git-status の打ち切りテストが Windows でタイムアウトする (#3071)

`test/server/files/files-git-status.spec.ts` の "answers more changes than it marks with none, and says so" が
Windows CI で `Test timed out in 15000ms` になる。このブランチ以外の実行でも同じテストが同じ形で落ちている。

## 原因

上限 `MAX_GIT_STATUS_ENTRIES` を超えさせるために、新しいリポジトリへ上限 + 1 個のファイルを書き、
その上で `git status` を走らせている。Windows のランナーではファイル作成と未追跡の走査が遅く、
このテストだけがその数ぶん払っている。判定が誤っているのではなく、準備が重い。

## 直し方

`mountFilesGitStatusRoute` が件数の上限を `maxStatusEntries`（省略時 `MAX_GIT_STATUS_ENTRIES`）として受け取る。
`maxHeadBytes` を既に受け取っているのと同じ形。テストは小さい上限で、超える場合（打ち切り）と
ちょうど収まる場合（全部に印）の両方を確かめる。打ち切りの規則そのものは `parseStatusEntries` の spec が持っている。

検証: ルート内の 3 つの判断（上限を渡す・打ち切りを返す・渡された上限を使う）をそれぞれ壊すと、このファイルの spec が赤になる。
