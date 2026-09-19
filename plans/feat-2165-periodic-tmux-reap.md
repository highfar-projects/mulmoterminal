# feat: detached な tmux セッションを定期的に掃除する (#2165)

## なぜ要るか

`sessionIdleReapDays` のスイープは**サーバ起動時に一度きり**しか走らない。
長時間動かすサーバでは、起動後に detached になったセッションが次の再起動まで
一切掃除されない。再起動が掃除の唯一の契機になっている。

11日間動かしたサーバで detached が24個溜まっていた（中身はアイドルな zsh のみ）。

## すでに用意されているもの

`sweepIdleSessions` は最初からタイマー呼び出しを想定して書かれている:

> At boot this is empty, and that is not something to rely on: the sweep is written to be
> safe whenever it runs, so a later caller (a timer, a button) cannot turn it into a
> session killer.

したがって述語もスイープ本体も触らない。**呼ぶ契機を増やすだけ**。

## 起動時スイープを置き換えないこと

起動時に置いた理由はコードに書かれている —— 起動直後は自分の pty が何も掴んでいないので
`liveHere` が全て false になり、スイープが最も効く。

タイマーからのスイープはこれより**必ず弱い**。自分が pty を持っているセッションには
届かないので、拾えるのは「サーバが pty を手放し、tmux クライアントも居ない」もの —
まさに稼働中に溜まっていく種類。両方あって初めて穴が埋まる。

## 入れるもの

- `common/sessionReap.ts` — `sanitizeReapIntervalHours` と `reapTimerEnabled`。
  どちらも純粋関数で、既存の日数側と同じ形に揃える
- `sessionReapIntervalHours` を config に通す（型 / 既定値 / パース / 更新 / 公開の5箇所）
- `server/index.ts` — 有効なときだけ `setInterval` でスイープを回す

**既定は 0（無効）** にする。勝手にセッションが消える挙動は、設定で明示的に
有効化したときだけ起きるべき。既存の設定ファイルが upgrade で挙動を変えないこと。

## テスト

- `sanitizeReapIntervalHours`: 整数のみ / 範囲外は既定へ / 小数・非数は既定へ / 0 は有効な「無効」
- `reapTimerEnabled`: 0 のときだけ false
