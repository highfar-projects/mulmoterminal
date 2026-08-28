# feat: 起動フォームを右パネルとして全モードで開く (#1867)

## 決まったこと

#1867 は「起動フォームを現在のセルの隣に**セルとして**挿す」案（以下 A 案）で書かれている。
実装前の設計検討で **B 案**（右から重なるパネル）に変更した。あわせてツールバーの `+` も
同じパネルを開くように統一する。

- **B 案**: 起動フォームを `TerminalGrid` の兄弟に置いた固定オーバーレイ（画面右端）で開く
- **`+` も統一**: 起動フォームの入口はパネル 1 つだけにする
- **セルから呼ぶと cwd がそのセルのものになる**

## なぜ A 案をやめたか

**1. 既存の右パネル機構は拡大時しか存在しない。** Files / Tools / Prompts / Canvas はすべて
`.zoom-row` の中にあり、この div は非 zoom 時に `hidden`（`TerminalGrid.vue:1260`）。
タイル表示の `.grid` は `trackStyle(layoutForCount(n))` の 9 等分トラックで、
`docs/grid-view-modes.md` が「nothing can be given less room without a second layout mechanism」
と名指ししている。A 案でも B 案でも、既存パネル機構は使えない。

**2. A 案は 3 つの表示モードそれぞれで意味が変わる。** タイル表示ではタイルを 1 枠占有して
後続がずれ、zoom 中は `insertCellAfter` が `expanded` を新セルに移すため拡大枠を奪う。
roster モードの行は `TerminalCell` ですらない別テンプレート。

**3. A 案は「空フォーム 1 個」の管理を作り直す必要がある。** `addCell` と
`cancelableLaunchUid` は `state.cells[state.cells.length - 1]` しか見ていない。
`cancelUid` はツールバーの cancel 状態と**フォーム内の閉じるボタンの両方**を駆動している
(`GridView.vue:348`)。中間に挿さったフォームは閉じるボタンが出ず、`+` でキャンセルできず、
`+` を押すと 2 個目の空フォームが増える。

B 案ではフォームがセルではないので、この管理が丸ごと不要になる。開閉のフラグ 1 つで済む。

## なぜそのまま作れるのか

**`CellLaunchForm` は既にホスト非依存。** props は素のデータだけで uid を知らず、emit は
意図だけ（`start` / `resume` / `run` / `launch` / `close`）。フォーム自身のコメントに
「the cell decides once what the picked agent means」とある。ホストが替わればよい。

**4 つの emit すべてにグリッド側の等価物が既にある。**

| emit | セル内の今の処理 | パネルからの経路 |
|---|---|---|
| `start(dir)` | `startPickedAgent`（セル内部状態） | `openNewTerminal({cwd, agent, afterSlotKey})` — スマホの起動要求 (#831) と同じ経路 |
| `resume({id,cwd,agent})` | `resumeSession`（セル内部状態） | `insertCellAfter(..., sessionCell(id, cwd, agent))` + `revealCell`（`GridView.vue:583`/`646` と同型） |
| `run(cmd)` | `runCommand(uid)` | `runScriptInNewCell(state, afterUid, cmd)` |
| `launch(pick)` | `launchInCell(uid, ...)` | `insertCellAfter(..., { session: null, cwd, launcher })` |

`CELL_FOR_AGENT`（`GridView.vue:441`）が shell と 5 エージェントすべてを
`autoStart` 付きのセル形状に変換する表を既に持っている。

**設定画面が「モードに依存しない UI」の既存前例。** `AppSettingsModal` は `TerminalGrid` の
兄弟として置かれ、実体は `fixed inset-0 z-[100]`（`SettingsModal.vue:214`）。`zoomed` も
`listMode` も見ていない。パネルは同じ仕組みを中央ではなく右端に出すだけ。

## 落とし穴

**挿入したら必ず `revealCell` する。** `GridView.vue:451` のコメント:
「what starts a cell is MOUNTING, and a cell mounts only on the page the grid shows」(#1557)。
`insertCellAfter` は手動インデックスでしかページを決められないので、ソート順を与えた
`revealCell` を続けて呼ばないと、`autoStart` セルが**一度も起動しない**ことがある。

**空グリッドの入口セルは残す。** `ensureEntry` が保証している「何も開いていないときの
フォーム」は一時的なフォームではなく空状態の表示なので、`+` がパネルになっても残す。

## 実装前に見つかった問題: カスタムエージェント

**`+` をパネルに統一する（選択肢 1）と、そのままではカスタムエージェントが起動できなくなる。**

Agent Picker の値 `AgentPick` は組み込み 5 種 + `custom:<id>`。セル内ではこれが
`pickedAgent`（セルローカル state）に入り、`customAgentId` がそこから導出されて接続に渡る
（`TerminalCell.vue:166` -> `:custom-agent` at 1443）。

ところが **`Cell` 型にはカスタムエージェントを載せる場所が無い**。`agent?: BadgedAgent` は
`asTerminalAgent()` を通した後の値（カスタムでも "claude"）で、どの wrapper で起動したかは
持っていない。そのため `CELL_FOR_AGENT` / `openNewTerminal` は組み込みしか作れない
（スマホの起動要求 #831 も同じ制限を持っている）。

セル内のフォームは起動できるのに、パネルからは起動できない — `+` を統一する以上これは
機能後退なので、この PR に含める。

- `Cell.customAgent?: string` を追加し、`parseGridState` で復元する
- `TerminalCell` に `initialCustomAgent` を足し、`pickedAgent` の初期値に使う
- `cellForAgent` を `LaunchAgent` ではなく `AgentPick` を取る形にする

副次的に、スマホからのカスタムエージェント起動も可能になる（本 PR では配線しない）。

## 変更点

- `src/components/CellChromeButtons.vue` — 各ターミナルのヘッダーに起動ボタン（`add`）
- `src/components/cellChromeBinding.ts` / `gridCell.ts` / `CellShell.vue` — `new-here` の emit 宣言と転送
- `src/components/gridTabs.ts` — `Cell.customAgent`、`parseGridState` での復元
- `src/components/TerminalCell.vue` — `initialCustomAgent` prop
- `src/components/LaunchPanel.vue`（新規）— `CellLaunchForm` を右端固定オーバーレイで包む
- `src/components/GridView.vue` — パネルの開閉状態と起点 uid、4 つの emit の配線、`+` の付け替え
- `common/keymap.ts` — `terminal-new-here`（現在のセルの cwd 入りでパネルを開く）
- `src/components/keymapLabels.ts` — ラベル
- `src/components/AppToolbar.vue` — `+` の押下状態がパネルの開閉を指すように
- specs — 4 つの emit がそれぞれ正しいセル形状を作ること、`revealCell` されること、
  起点セルの cwd が入ること、起点が無いときは既定 cwd になること、3 モードすべてで開くこと
- 英日ガイド と `server/skills/mulmoterminal-keys/SKILL.md`

## 判断が要るところ（実装時に決め、PR で明示する）

- **ショートカット名** `terminal-new-here`。`terminal-new`（既定 cwd でパネル）と
  `terminal-new-adjacent`（このセルの dir で shell を即起動、既存・変更なし）の間。
- **起点セルの決め方**: `expandedUid ?? focusedCellUid`。zoom 中でなくてもフォーカス
  セルがあれば使う。`NEEDS_A_CURRENT_TERMINAL` には入れない — 起点が無ければ既定 cwd で
  開くだけで、ショートカット自体はどの状態でも効く。
- **既存 `+` の挙動変更**: 後ろに空セルが増えなくなる。これは選択肢 1 の唯一のコスト。

## セル側の入口はボタンにした（ショートカットだけでは届かない）

当初はキーマップアクション `terminal-new-here` だけを足したが、**keymap には既定のバインドが無い**
ので、config.json を書くまで UI に何も現れない。issue の中心が「そのセルの dir で開く」である以上、
設定を書かなければ到達できない機能は目的を満たさない。各ターミナルのヘッダー、Expand の隣に
`add` ボタンを置いた。

拡大時限定にはしていない。右パネルはセルの領域を分割せず上に重なるので、ペイン系ボタンが
`v-if="expanded"` である理由（拡大セルにしか無い余白を分け合う）が当てはまらない。

### 実装中に踏んだ 2 つの罠

**1. emit 宣言漏れでボタンが無反応だった。** `CellChromeButtons` に足しただけでは届かず、
`GridCellEmits`（`gridCell.ts`）と `CellShell.vue` の `defineEmits` にも `new-here` が要る。
`cellChromeBinding.ts` のコメントが #1573 の collections ボタンで同じことが起きたと書いている。
ブラウザの `[Vue warn]: Component emitted event "new-here" but it is neither declared...` が
出どころを名指ししてくれた。

**2. ツールバーの `+` が表示と違う動きをした。** トグル判定を「起点が同じなら閉じる」にしていたため、
セルから開いたパネルに対して `+` を押すと閉じずに対象がワークスペースへ切り替わった。`+` は開いて
いる間ラベルが "Close the launch panel" になるので、表示と挙動が食い違う。ツールバーからの要求は
開いていれば常に閉じるようにした。セルのボタンは別のセルを指していれば再ターゲットのままでよい。

## 実機確認（サンドボックス: 別ポート + 隔離 HOME）

| | 結果 |
|---|---|
| タイル表示で `+` → 右端にパネル、グリッドの座標は不変 | PASS |
| セルの `+` → **そのセルの dir** で開く（タイル / 拡大の両方） | PASS |
| 閉じる導線 3 つ（パネルの ✕ / ツールバーの `+` / Escape） | PASS |
| 拡大（ロスター）時、拡大ターミナルは覆われるが消えない | PASS |
| パネルから shell 起動 → セルが増え、ターミナルが描画される | PASS |
| console エラー / Vue 警告 | なし |

パネルは自分を開いたセルのボタンを覆うので、閉じるのはパネルの ✕ かツールバーの `+` になる。
