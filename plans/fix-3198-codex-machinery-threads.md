# fix: Codex の再開一覧から、codex が自分のために走らせたスレッドを外す（#3198）

## 症状

ランチャーの「ここで codex の会話を再開」一覧が、タイトル無しの **Guardian review** 行で埋まる。
報告者の環境では作業ディレクトリごとに本人の会話が一つで、残りは全部 guardian の行。
`SESSION_LIST_LIMIT` の枠を食うので、本人の会話が一覧から押し出されることもある。

## 原因

`server/agents/codex/codex-sessions.ts` は `session_meta.thread_source` の deny-list
（`subagent` / `automation`）だけで「機械のスレッド」を弾いていた（#1777 の修正）。
codex は guardian の承認レビューを `thread_source: "guardian_review"` の子スレッドとして
親の cwd 付きで永続化するので、cwd フィルタを通り、deny-list にも無く、一覧に載る。

名前を一つ足せば今回は直るが、同じ形の穴がもう一つ開いている。
`thread_source: "memory_consolidation"`（記憶の整理スレッド）も同じ経路で rollout を書く。
名前を追いかける限り、codex が機械スレッドを一種類増やすたびに issue が一つ立つ。

## 上流 codex の事実（openai/codex, `codex-rs/protocol/src/protocol.rs`）

- `session_meta.source`（`SessionSource`）は **誰が起動したか**。外部タグ付きの enum で、
  フロントエンドは文字列（`"cli"` / `"vscode"` / `"exec"` / `"mcp"` / `"unknown"`）か `{"custom": …}`、
  codex 自身が起動したものは `{"subagent": …}` か `{"internal": …}` になる。
  codex 自身の `SessionSource::is_non_root_agent()` は **`Internal(_) | SubAgent(_)`** そのもの。
- `session_meta.thread_source`（`ThreadSource`）は **何のためのスレッドか**。
  `user` / `subagent` / `guardian_review` / `memory_consolidation`、それ以外は `Feature(名前)`。
  `automation` は `Feature("automation")` で、Codex アプリが app-server の `thread/start` に付けて起動する。
  この場合 `source` はフロントエンドの形のままなので、構造だけでは見えない。
- guardian レビューは `core/src/codex_delegate.rs` で親の複製として起動される
  （`source: {"subagent": {"other": "guardian"}}`、`thread_source: "guardian_review"`、親の cwd と originator）。
  `guardian_approval` 機能は `Stage::Stable` で既定有効。
- 記憶整理は `memories/write/src/runtime.rs` が
  `source: {"internal": "memory_consolidation"}`、`thread_source: "memory_consolidation"` で起動する。
- codex 自身の再開ピッカーは `INTERACTIVE_SESSION_SOURCES`（cli / vscode / custom 二種）の allow-list。
  こちらは `exec` のセッションも一覧に出す設計なので allow-list にはしない。

## 手元の実測（`~/.codex/sessions`、codex-cli 0.156.1）

```
find ~/.codex/sessions -name '*.jsonl' | xargs -I{} sh -c 'head -1 "{}"' \
  | grep -o '"source":\({[^}]*}\|"[a-z_]*"\)' | sort | uniq -c
```

| `source` | 件数 | `thread_source` |
|---|---|---|
| `"exec"` | 12895 | `user`（古いものは欄が無い） |
| `"cli"` | 78 | 同上 |
| `{"subagent":"review"}` | 15 | 全件 `subagent` |

- `source` は全件にある。`thread_source` は古い rollout に無い（333 件）。
- `guardian_review` は手元にゼロ。手元は `codex exec` 中心で承認プロンプトが出ず、guardian が走らない。
  形の根拠は上流ソースと issue 本文の `session_meta`。

## 直し方

機械スレッドの判定を **構造（`source` の種類）を主、名前（`thread_source`）を従** の二本にし、
純関数として `server/agents/codex/codex-thread-origin.ts` に切り出す。

1. `sessionSourceKind(source)`: `{"subagent": …}` なら `subagent`、`{"internal": …}` なら `internal`、
   それ以外（文字列 / `{"custom"}` / 無し / 壊れた値）は `root`。上流の `is_non_root_agent` と同じ規則。
   新しい機械スレッドは二つの鍵のどちらかの下に来るので、ここを触らずに弾ける。
2. `MACHINERY_THREAD_SOURCES`: `subagent` / `guardian_review` / `memory_consolidation` / `automation`。
   上流の enum が `user` 以外として名前を持つもの全部。`automation` だけは構造で見えないので、この一覧が無いと消せない。
3. `isResumableThread` は、構造が `root` **かつ** 名前が一覧に無いとき真。どちらも deny 規則で allow-list にはしない
   （#1777 の判断を維持: 未知の値や欄の欠落は会話として残す）。
4. `parseCodexSessionMeta` が `sourceKind` も返す。一覧の関門（`matchingRollouts` の一箇所）は変えない。

挙動が変わるのは「`source` が subagent / internal の rollout が一覧から消える」こと。
手元の該当 15 件はすべて `thread_source: subagent` でもあるので、今日の一覧と差は出ない。

## 検証

- 純関数は両方向で固定する。正常系は上流の各 variant の形、異常系は null / 数値 / 配列 / 空 object /
  大文字の鍵 / 内側の形だけ、を流す。
- 一覧の spec に guardian_review / memory_consolidation / 未知の名前の subagent / custom フロントエンドを足す。
- issue #3198 の `session_meta` をそのまま 1 行目として流し、弾かれることを固定する。
- `yarn format` → `yarn lint` → `yarn typecheck` → `yarn test`。
