# fix-2090: 答えが返らないプロンプトで起動が止まらないようにする

#2090 の**片方**。もう片方（PID 再利用で幽霊エントリが残る）は別 PR。

## 何が起きたか

Windows のラッパー（stdout/stderr だけをログファイルへリダイレクトし、コンソールウィンドウを
作らない子プロセス）から `npx mulmoterminal --port <port> --no-open` を起動すると、

    MulmoTerminal is already running (http://localhost:<port>).
      ...
      To stop the running one instead:  npx mulmoterminal@latest stop

まで出たきり、ポートは bind されず、プロセスは10分以上生き続ける。

## どこで止まっているか（実測）

報告者は非 TTY 分岐（`confirmNoRunningInstance` の `!process.stdin.isTTY`）を疑っていたが、
**実際は TTY 分岐の `promptYesNo`**。npm の 4.25.0 を展開して `bin/` が同一であることを確かめた
うえで、`instances/<pid>.json` に「生きている他人の pid」を書いて両分岐を実際に走らせると、
出力の形が決定的に違う:

| | 非 TTY 分岐 | TTY 分岐 |
|---|---|---|
| already running 行 | `[mulmoterminal]` プレフィックス**有り**（`log()` 経由） | プレフィックス**無し**（`rl.question` が生文字列を書く） |
| 直後の `Note: both share ~/.mulmoterminal` | 出る | 出ない（答えを待っている） |
| 末尾 | 次の処理へ進む | `Start another one anyway? [y/N] ` で改行なく終端 |

報告ログはプレフィックス無し・NOTE 無しなので TTY 分岐。つまりそのラッパーでは
`process.stdin.isTTY` が **true** で、誰も打てないコンソールを readline が待ち続けている。

## 直す対象は「その1行」ではなく規則

**起動経路のプロンプトは、答えが返らないという結末を持てなければならない。** `isTTY` は
「聞ける端末がある」であって「答える人がいる」ではない。この2つを同一視したのが欠陥で、
症状が出た1箇所だけでなく `promptYesNo` の呼び出し全部が同じ欠陥を持つ。

そして**この症状に PID 再利用は必須ではない**。`liveInstances()` が空でなく stdin が無人の
TTY でありさえすれば — 本物の二重起動でも — 起動は永久に止まる。

## 設計

`plans/fix-1061-instance-registry.md` が既に意図を書いている:

> 非 TTY では聞かずに警告だけ出して続行する。答える人がいないプロンプトで起動を止めるのは、
> サーバを求めたスクリプトに対する答えとして間違っている

意図は正しく、判定だけが間違っていた。なので**「答えが返らなかった」を「聞く相手がいなかった」
と同じ意味にする**。各呼び出し箇所は非 TTY のときの答えを既に持っているので、新しい方針を
足すのではなく、そこへ合流させるだけで済む。

`bin/prompt-yes-no.js` に `askYesNo()` を切り出し、`"yes" | "no" | "unanswered"` を返す。
`unanswered` になるのは2つ:

- **締め切り**を過ぎても入力が無い（このバグ）
- stdin が **EOF** で閉じる。現状 `rl.question` のコールバックは呼ばれないまま Promise が
  永久に未解決になり、イベントループが空になるとランチャーが**何も言わず exit 0** する
  （パイプ stdin で実測）。同じ invariant の同じ穴なので一緒に塞ぐ

呼び出し箇所の合流先は、それぞれが既に持っている非 TTY の答え:

| 呼び出し箇所 | 非 TTY のときの答え | `unanswered` の行き先 |
|---|---|---|
| `confirmNoRunningInstance` | 警告して続行 | 続行（+ 待たなかったと1行言う） |
| `pickPort` | `portInUseAction` → `stop` → exit 1 | exit 1 |
| `runInit` | claude を起動せず案内だけ | 起動せず案内だけ |

締め切りは寛大に取る。遅すぎる場合の代償はスクリプトがその分だけ待たされること（有界で、
その後ちゃんと起動する）。早すぎる場合の代償は、読んでいる最中の人間の答えを勝手に決めること。
回復できる方向に倒す。

## やらないこと

- **`isTTY` 判定の改良**。「答える人がいるか」を確実に当てる方法は無い、というのがこのバグの
  中身なので、当て方を変えても同じ穴が残る。締め切りは当てずに済ませる方法。
- **PID 再利用そのもの**（`isProcessAlive` が生存であって同一性でない件）。別 PR。
- **非対話フラグの追加**。要求されていないし、締め切りが入れば無くても壊れない。

## 検証

- `test/bin/prompt-yes-no.spec.ts` — yes / no / 空 Enter / 締め切り超過 / stdin EOF の5方向。
  ストリームとタイマーは注入して、実プロセス無しで走らせる。
- 実機: 報告者と同じ形（stdin=TTY, stdout=ファイル）で `script` 越しに起動し、締め切り後に
  ちゃんと先へ進んでポートを bind することを確認する。
