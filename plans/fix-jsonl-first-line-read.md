# JSONL の先頭 1 行だけを読む

issue: #1554

## 問題

`server/agents/codex-session.ts` の `readSessionMeta` が、codex rollout の**先頭 1 行のためにファイル
全体を文字列化**していた。呼び出し元の `pickFreshSession` は codex の spawn 監視から**1 秒おきに最大
30 分間、直近 2 日分の rollout 全部**に対して回る。

実測（報告者のマシン）: 直近 2 日で 149 ファイル / 37MB。**数百バイトを見るために毎秒 37MB を読み直して
いた。**

## 直し方

JSONL は 1 行 1 JSON なので、必要な行だけ読めばよい。`server/infra/jsonl-file.ts` は #998 の後に
作られた読み分けモジュールで、行ストリーム・末尾読み・範囲読みは既にあるが「先頭 1 行だけ」が
無かった。

- `readFirstJsonlRecord(file)` を追加。1 行取れた時点で `readline` と stream を畳むので、ファイルの
  重さに関係なく 1 チャンクで済む。空行はスキップし、JSON オブジェクトでない先頭行は null。
- `parseSessionMetaLine`（行を取る・既存の公開関数）から `sessionMetaOf`（レコードを取る）を切り出し、
  ストリーム版と同じ判定を共有する。
- `readSessionMeta` と `pickFreshSession` が非同期になる。呼び出しは `watchForCodexSession` だけで、
  そこは元から async。

## テスト

`test/server/infra/jsonl-file.spec.ts` に 5 ケース。うち 1 つは**「先頭行の後ろがどれだけ大きくても
読まない」**を、8MB の 2 行目で固定する（この変更の眼目そのもの）。

`codex-session.spec.ts` は該当ケースを async 化。

## 対象外

- **OOM の真因**。クラッシュレポート 4 件はすべて `FatalProcessOutOfMemory` だが、rollout は最大 6MB
  なのでこの経路単体では 4GB に届かない。継続調査。
- `server/agents/grok-sessions.ts` の `readSummary` も全読み。要約ファイルで小さいので別途。
