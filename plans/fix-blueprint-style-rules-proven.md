# fix: every rule a style turns on is shown firing on a counter text (#2602)

## 問題

「規約をつくる」の counter の検査は、各反例が何かに引っかかることと、全体で三つ以上の規則が働くことしか求めていなかった。英語の手本で実際に回すと、`contraction-consistency` を chaff.yaml に入れたまま、報告に「短縮形はまったく反応しない」と書いた。

確かめると、規則は働いていた。chaff.yaml で名指しすれば試験中の規則も有効になり、多数派がはっきりした文では反応する。反例がどちらにも寄らない文だったのだと思われる。

もう一度回すと、今度はこの規則そのものを使わず、報告は「試験中で標準では動かない」とした。rules の SKILL が、試験中の規則のうち `preferred-term` と `latin-spacing` の二つしか挙げていなかったため。

## 方針

- `configuredRules`（`blueprints/style/checks/configured.mjs`）で、chaff.yaml が設定した規則を読む。rules の検査と共有する。
- counter の検査: chaff.yaml が off 以外で名指しした規則は、どれかの反例で一度は反応していることを求める（`unprovenRules`）。一貫性の規則は info で出るので、info でもよい。
- counter の SKILL:
  - 一貫性の規則の反例は、一方に寄せてから一、二か所だけ崩すこと。
  - 反例で試さないまま「反応しない」と書かないこと。
- rules の SKILL: 英語の一貫性の規則（短縮形・シリアルコンマ・見出しの大文字化）を挙げ、試験中の規則は名指しすれば有効になると一般化した。

## 実機

同じ英語の手本で三回回した。
- main: 規則を入れたまま「反応しない」と報告した。
- このブランチ（SKILL の一般化の前）: 一貫性の規則を使わず、`max-sentence-length` だけにした（新しい検査は満たした）。
- このブランチ（一般化の後）: 三つの一貫性の規則を chaff.yaml に入れた。規則ごとに反例（contractions.md、oxford.md、title-case.md）を書き、三つとも反応した。検査は一度も失敗せず、報告は「途中で do not に変わると知らせる」と正しく書いた。
