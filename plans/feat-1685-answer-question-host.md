# 質問への回答をホスト側の1コマンドに一本化する (#1685)

#1679 で web の右ペインから答えられるようにした。次はスマホから。そのために **送信をホスト側に移す**。

## いまの形と、変える理由

web ペインは自分で2段やっている:

1. `GET /api/question/:sessionId` で「今も同じ `toolUseId` が開いているか」確認
2. ブラウザから ws に生キーを書く（30ms 間隔、開始時のソケットに固定）

スマホは RemoteHost 経由で **PTY の ws を持たない**ので、この形をそのまま真似できない。#804 は
「キー名を送り、バイト列はホストが持つ」allow-list でそこを埋めたが、質問に答えるだけなら
**picks（何番を選んだか）だけ送れば足りる**。バイト列を組むのはホスト。

web も同じ口に載せる。副作用を確認した上での判断:

- **到達性は同じ。** ブラウザの ws 入力は `entry.term.write(msg.data)`（`pty-connection.ts:147`）で、
  ホストの `remoteHostWriteToSession`（`index.ts:718`）は同じ pty エントリに書く
- **#1684 iter-2 のバグ種が構造的に消える。** 「打鍵中にソケットが張り直されると後半が別セッションに
  届く」は、session id で引いた pty に書けば起こりえない。固定する対象が無くなる
- **#1684 iter-4 の窓が閉じる。** 確認と送信が1リクエストで原子的になる
- 入力の所有者が1つになるので、3つ目のクライアントが増えても同じ道を通る

## 不変条件

**リクエストが運んできたバイトは絶対に PTY に書かない。** 書くのは `keysForAnswers` が picks から
組んだ列だけ。picks は整数の配列で、範囲と昇順は `keysForAnswers` が拒否する。これが #781 で引いた
信頼境界を、さらに狭めた形になる。

## 実装

### 共有（`common/askQuestion.ts` は据え置き）

`openQuestionOf` と `keysForAnswers` はそのまま使う。#1679 で実測して固定した資産。

### サーバ

- `server/session/answerQuestion.ts`（新規・純粋寄り）— 「開いているか確認 → キー列 → 書く」を
  1関数に。I/O は注入（`openQuestionOf` に渡す履歴の取得と、pty への write）。結果は
  `{ ok: true } | { ok: false; reason: "closed" | "unwritable" | "bad-picks" }`
- `POST /api/question/:sessionId/answer` — `sameOriginGuard` の内側、`SESSION_ID_RE` 検証
- RemoteHost コマンド `getOpenQuestion` / `answerQuestion` — 中身は同じ関数

### クライアント

- ペインは POST 1本にする。`sendKeySequence` と `terminalConnectionsKeySequence.spec.ts` は削除
- 失敗（`closed` / `unwritable`）は握り潰さない。ペインは既に閉じているので、**再取得して開き直す**
  — `closed` なら何も出ない（正しい）、`unwritable` なら質問が残るので、そこで理由を出す

### pty を持たないセッション

再起動を生き延びたセッションは capture-pane で見えるが pty が無い（`index.ts:717` のコメント）。
そこに書けないのはブラウザ経由でも同じなので退行ではないが、**黙って無反応にしない**。

## 範囲外

mulmoserver 側の UI。#781 の汎用生キー送信（`/model` のようなメニュー操作）。
