# feat: CSV を表とグラフにして分析する同梱スキル (#3091)

構想 #3090 の最初の一歩。プラグインには手を入れず、手順をスキルにする。

## 決まったこと

- 名前は `mulmoterminal-data-analysis`。
- スクリプトは Node だけ。
- 統計のパッケージ `simple-statistics` を、スキルの作業ディレクトリに入れて使ってよい。MulmoTerminal の依存には入れない。
- スキルは「分析の流れ」一つから。手法ごとに分けるのは使ってみてから。

## 変更

- `server/skills/mulmoterminal-data-analysis/SKILL.md`（新規）。
  - 読む → 基本統計 → 表（直したいところは計算式、表にない統計は値） → グラフ → 置き場所を伝える。
  - 表を直されたあとの読み直しと描き直しも含める。
- `common/bundledSkills.ts` の `BUNDLED_SKILL_NAMES` に足す。足さないと配られない。
- `test/server/infra/fs/install-bundled-skills.spec.ts` の `notSettings` に足す。設定を書くスキルではないので、`mulmoterminal-config` からは案内しない。
- ガイド `docs/guide/{en,ja}/spreadsheet.md` の「頼み方」からスキルに触れる。
- `CLAUDE.md` の同梱スキルの一覧に足す。

## スクリプトの置き場所

エージェントに作業領域の場所を渡す環境変数はない（渡されるのは `MULMOTERMINAL_PORT` と `MULMOTERMINAL_SESSION_ID` だけ）。
一方で、`presentSpreadsheet` の返事には保存先が**絶対パス**で入る（#3084）。そこで次の順にする。

1. 計算は一時ディレクトリ（`mktemp -d`）で行う。
2. 表を出したら、その保存先の `artifacts/` を根にして、`artifacts/analysis/YYYY/MM/<表の id>/` にスクリプトを写す。

利用者のリポジトリには何も書かない。

## 確かめ方

- `yarn test`。特に、スキルの一覧とディスクの照合と、frontmatter の検査。
- 実際の CSV で、作業領域のセルとプロジェクトのセルの両方を、表とグラフが出るところまで通す。
