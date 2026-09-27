# 設計図のビルドが git worktree の中で「信頼されていない」と断られる

issue: #2313

## 何が起きていたか

worktree の中のフォルダでビルドを始めると、そこで Claude Code の信頼の確認に答えた後でも断られる。Claude Code 自身はそのフォルダで確認を出さずに起動する。

## 原因

`server/blueprint/trust.ts` は、フォルダから上へ、いちばん近い `.git` までの信頼を探す。worktree では `.git` がファイルなので、worktree の根で止まる。Claude Code は worktree の信頼を**本体のリポジトリの根**から取り、確認への答えもそこに記録する。

Claude Code 2.1.283 で、確認には答えずに測った:

- 信頼されていないリポジトリの worktree を、信頼された親の下に置く: 確認が出る
- 信頼されたリポジトリの worktree を、信頼されていない場所に置く: 確認が出ない
- その隣の普通のフォルダ（対照）: 確認が出る

## 直し方

`.git` がファイルなら、その `gitdir:` と、その中の `commondir` から本体の `.git` を求め、その親（本体の根）に記録された信頼も数える。`commondir` の無いもの（submodule）と、共有先が `.git` でないもの（bare リポジトリの worktree、本体の作業ツリーが無い）は今までどおり。

## 確かめ方

- 純粋な判定（`isTrustedByClaude` に本体の根を渡す、`gitdirOf`）と、git が書くのと同じ形のファイルでの `mainRootOf` / `claudeTrusts` を試験し、判定を一つずつ壊して赤になることを確かめた。
- 実際の設定（`~/.claude.json`）で、worktree の中のフォルダが直した後は信頼され、直す前は信頼されないことを確かめた。
