# worktree を WORKING DIRECTORY のチップとして記憶しない

issue: #1542

## 問題

launch form の **WORKING DIRECTORY** のチップ列に managed worktree が溜まっていく
（`orion (uifix)` / `orion (eslint)` / `mulmoclaude3 (test)` …）。

困る理由は 3 つ:

- **worktree は使い捨て** — 1 タスク 1 ブランチの隔離用ディレクトリで、「またここで起動したい場所」
  ではない。
- **消えても残る** — worktree を削除してもチップは消えない（`remove-preset` はチップの × ボタン
  だけ）。実体のないパスを指すチップが積み上がる。
- 本来の「よく使うプロジェクト」が押し出されて見つけにくくなる。

## 記録経路は 2 つある

片方だけ塞いでも直りきらないので、両方に同じルールを効かせる。

| 経路 | いつ | どこ |
|---|---|---|
| セル起動時の自動記録 | セルが起動するたび、サーバ確定 cwd を記録 | `recordPreset()` — `src/composables/useAppConfig.ts` |
| `mulmoterminal init` の seed | init 実行時、Claude の履歴の cwd からリストを作り直す | `deriveCwdPresets()` — `server/config/cwd-presets.ts` |

`presetLabel()` には worktree 専用の分岐（`repo (task)` 表記）まであり、記憶することが前提の作りに
なっていた。

## 直し方

判定を **`common/worktreePath.ts`** に置き、両サイドから使う。

- `worktreeLabel()` を `src/components/cwdDisplay.ts` からここへ移動（呼び出しは 4 箇所）
- `isManagedWorktreePath()` を同ファイルに追加

`common/` に置くのは CLAUDE.md の「両側が判断に使う値・ルールは `common/`、`server/` と `src/` に
ミラーしない」に従ったもの。ブラウザは realpath できないのでサーバの `isManagedWorktree()`
（`git worktree list` と realpath で突き合わせる）は共有できず、パス判定を 2 つ持つと必ずズレる。

**読み出し時のフィルタではなく記録時のスキップにする。** 既に保存されているエントリはユーザーの
config なので、そこに勝手に手を入れない — 不要なら × ボタンで消してもらう。副作用として、既に
リストにある worktree は「先頭へ移動」もされなくなる（= 放置されるだけで、消えも増えもしない）。

## やらないこと（ユーザー確認済み）

- 既存 preset の自動掃除／マイグレーション
- `migrateLegacyRecents()`（pre-#163 の localStorage からの一度きりの取り込み）— 既存ユーザー
  データの取り込みなので「既存には触れない」と同じ扱い
- `presetLabel()` の worktree 分岐の削除 — 上の経路からはまだ到達しうる

## 変更ファイル

| ファイル | 内容 |
|---|---|
| `common/worktreePath.ts` | 新規。`worktreeLabel()`（移動）+ `isManagedWorktreePath()` |
| `src/components/cwdDisplay.ts` | `worktreeLabel` / `MANAGED_DIR` を削除（表示整形だけを持つ） |
| `src/components/presets.ts`, `src/components/TerminalCell.vue` | import 先を `common/` に |
| `src/composables/useAppConfig.ts` | `recordPreset()` にガード |
| `server/config/cwd-presets.ts` | `deriveCwdPresets()` にガード |
| `test/common/worktreePath.spec.ts` | 新規。移動した `worktreeLabel` のテスト + 述語のテスト |
| `test/src/components/cwdDisplay.spec.ts` | `worktreeLabel` の describe を上へ移動 |
| `test/src/composables/useAppConfig.spec.ts` | 記録されない・リポジトリ本体は記録される・既存エントリを触らない |
| `test/server/config/cwd-presets.spec.ts` | init の seed でも worktree が落ちる |
| `README.md`, `docs/guide/{en,ja}/basics.md` | チップの説明に worktree 除外を追記 |
| `server/skills/mulmoterminal-dirs/SKILL.md` | `cwdPresets` を母集団として読む箇所に注記 |

## 判定を lexical にしてよい理由

`worktreeLabel()` が見ている `-<8hex>` サフィックスはサーバの `worktreesRoot` が生成するもので、
ユーザーが自分で作ったディレクトリと衝突する余地がほぼない。間違えたときのコストは「チップが 1 つ
出る／出ない」だけで、セッションの行き先を変えるようなものではない。チップのラベル付けが既に同じ
判定を使っているので、判定基準が 2 つに割れることもない。

## 検証

- `yarn format` / `yarn lint`（0 errors）/ `yarn typecheck`（exit 0）/ `yarn build`（exit 0）
- `yarn test` — 638 files passed | 9233 passed | 45 skipped
- 新しい spec が本当に型チェックされているか `tsc -b tsconfig.test.json --listFiles` で確認済み
  （`common/worktreePath.ts` と `test/common/worktreePath.spec.ts` の両方が対象に入っている）
