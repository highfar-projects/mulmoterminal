# chore: GitHub issue テンプレートを追加する (#1715)

## 背景

`.github/` の下は `workflows/` だけで、issue テンプレートが 1 つも無い。New issue は白紙から
書く形なので、報告に含まれる情報が毎回ばらつく。バージョン・OS・起動方法（npx か `yarn dev` か）
の無い報告、再現手順の無い報告が実際に届いている。

## 形式は Issue Forms（YAML）

Markdown テンプレート（`.md`）は本文のひな形を挿入するだけで、空のまま submit できる。
Issue Forms（`.yml`）は `validations.required: true` を付けた項目を空にできないので、
バージョンや再現手順の欠落を、お願いではなく構造で防げる。

## ファイル

```
.github/ISSUE_TEMPLATE/
  config.yml                 白紙 issue は残し、使い方の質問を Discussions と guide へ逃がす
  bug_report.yml             バグ報告
  problem_or_use_case.yml    課題・ユースケース（旧「機能提案」）
```

言語は英語のみ。

## テンプレートに載せる 3 つのルール

### 1. 略語を使わない（両方）

"MT" ではなく "MulmoTerminal"、"repro" ではなく "steps to reproduce"。この repository の issue は
人間とコーディングエージェントの両方が読むので、書き手には自明な略語が読み手には推測になる。
両テンプレートの先頭の `markdown` ブロックに置く。

### 2. バグ報告は `mulmoterminal-bug-report` skill を通す

required checkbox で先に skill を実行してもらう。skill は実際の config / schema / version を
読んで「設定か仕様どおりの動作か」を判定し、既存 issue を検索し、環境情報を集めて鍵に見えるものを
マスクしたうえで、残ったものだけを起票する。

**フォームの項目は skill の報告本文と 1 対 1 で対応させる。** skill 側（`server/skills/
mulmoterminal-bug-report/SKILL.md` の Step 4）が出す見出しは
What happened / What I expected / Steps to reproduce / Environment / Attachments。
ここがずれると、skill が作った本文をフォームに貼り直す作業が発生して、skill を通す動機が消える。

skill を使えない人（GitHub の Web から直接書く人）を締め出さないよう、checkbox は
「skill を実行した」と「skill を使わなかったので自分で確認した」の 2 択ではなく、
skill を実行したことの確認 1 つ + 使えない場合の代替手順を `markdown` で案内する形にする。

### 3. 機能提案ではなく、課題とユースケースを書いてもらう

テンプレート名を "Feature request" ではなく **"Problem or use case"** にする。聞くのは
「どういう状況で、何をしようとして、何に阻まれたか」であって、どんな機能が欲しいかではない。

理由は 2 つあり、どちらもテンプレート本文に書く。

- **提案は答えを狭める。** 報告者が思いついた 1 つの形に議論が固定され、view mode や session 層の
  実際の組み合わせを知っている側が持っている、もっと安い答え（あるいは「それは別名で既にある」）に
  届かなくなる。
- **提案は課題を巻き込んで捨てられる。** 提案が却下されると、その提案が生まれた元の困りごとまで
  一緒に閉じられ、誰も解かないまま残る。

アイデアがある人を黙らせるわけではない。「もし既にアイデアがあるならここ」という **optional の欄を
最後から 2 番目に置く**。位置そのものが「これは数ある案の 1 つ」という意味になる。

コードは書かない。パッチ・diff・ファイル単位の実装計画を入れない。required checkbox で明示する。
実装をどうするかは、採択後に `plans/` と pull request で決める。

聞く項目は、課題の実在と大きさを測れるものに絞る。

| 項目 | 必須 | なぜ聞くか |
| --- | --- | --- |
| What were you trying to get done | 必須 | ユースケース。具体的な作業名で書いてもらう |
| What got in the way | 必須 | 詰まった地点そのもの |
| What you do about it today | 必須 | 今の回避策。無いなら「諦めた」と書く。課題の値段がここに出る |
| How often you run into this | 必須 | 頻度。優先度の材料 |
| If you already have an idea | 任意 | 逃がし弁。最後から 2 番目 |

## 決めたこと

- **白紙 issue は無効にしない**（`blank_issues_enabled: true`）。メンテナが立てる内部タスク
  （lint、perf、refactor など）はどちらのテンプレートにも当てはまらない。テンプレートを強制すると
  そのたびに noise を消す作業が要る。
- ラベルは既存の `bug` / `enhancement` を自動付与。新しいラベルは作らない。
- タイトルの既定プレフィックスは既存 issue の慣習に合わせて `bug: ` / `feat: `。
  課題テンプレートに `feat: ` を付けるのは「解は機能である」と先取りしていて、上のルール 3 と
  わずかに矛盾する。それでも既存 issue 一覧の見た目を揃える方を採った。
- dropdown の選択肢は skill の Step 1（What kind / Where / Which agent / How often）から取る。
  skill を通ってきた人が同じ語彙で答えられる。

## 検証

Issue Forms は GitHub 側でしか描画されないので、ローカルで確認できるのは構文まで。

1. YAML として parse できるか。
2. **GitHub の公式 schema に対して妥当か。** 自分で書いた規則ではなく、SchemaStore が配っている
   `github-issue-forms.json` / `github-issue-config.json` を落として ajv で当てる。外部の権威に
   照らすのであって、自分の理解と突き合わせるのではない。
3. **その検証器が実際に効いていることを、壊した写しで確かめる。** 何を入れても PASS する検証器は
   何も証明しない。`name` を消す / 未知の `type` / `markdown` に `validations` / `dropdown` から
   `options` を消す / `textarea` から `label` を消す、を注入して捕まることを見る。
4. push 後、GitHub の New issue 画面で 3 つとも描画されること、required を空にすると submit
   できないことを実際に見る。これが最終的な ground truth。

**注意: issue テンプレートは default branch のものしか使われない。** feature branch に置いた
状態では New issue 画面には出てこないので、4 は merge 後にしか確認できない。1〜3 を merge 前に
必ず通しておく理由がこれ。
