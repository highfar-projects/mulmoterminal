# 他の選択肢のページと facts.json に Codealong を足す（#3144）

## 経緯

#3144 は Codealong（https://github.com/codealong/codealong）の作者本人が立てた issue で、
singularitysociety.org の比較記事に載せてほしいという提案。記事側（ss_website）には
2026-10-21 に追加して公開済み。製品のガイドにも同じものがあるので、そちらも揃える。

## 内容

- `docs/guide/{en,ja}/alternatives.md`
  - 「それぞれのツール」の最後（MulmoTerminal の直前）に節を1つ
  - 一覧の表に1行
  - 「選び方」に1行
  - 「試していないこと」に、このページに載った経路（作者本人からの指摘）を1文
- `docs/facts.json` に `alternatives`、`docs/facts.schema.json` に同じ名前の property

## 確かめたこと（2026-10-21）

```
gh api repos/codealong/codealong --jq '{license:.license.spdx_id,created:.created_at}'
gh api repos/codealong/codealong/releases --jq '.[] | {tag:.tag_name, published:.published_at}'
gh api -H "Accept: application/vnd.github.raw" repos/codealong/codealong/readme
```

Apache-2.0、初回リリース v0.3.0 は 2026-10-20。セッションを自分で走らせず（各エージェントが
書いている記録を読む）、隔離もしない。worktree を作るのはエージェント側で、git は読み取りのみ。
対応は Claude Code / Codex / OpenCode / Antigravity / Cursor。macOS 13 以降と Linux（X11、
ソースからビルド）。iPhone 版のリポジトリは公開されているが自分でビルドする段階。

ページの数字は 2026-08-03 時点なので、この節だけ確認日を書いて区別した。

## facts.json の形

名前の一覧とガイドのページへのリンクだけにした。スキーマが
「The prose in the guide is the source of truth; this file restates it」と言っているので、
星の数やライセンスのような動く値を持たせると二重管理になる。日付は `updated`（ファイル全体を
人が確かめた日）とは別に、この項目だけの `checked` を持たせた。全体を確かめ直したわけではない。

## やらないこと

- 他の6本の URL やライセンスを facts.json に足すこと（ページ側にも URL は無い）
- `updated` の更新（この項目以外は確かめていない）
