# fix-2090: 生きている pid はまだ身元ではない

#2090 の**もう片方**。プロンプトが永久にブロックする件は `plans/fix-2090-unanswerable-prompt.md`。

## 何が起きたか

`~/.mulmoterminal/instances/<pid>.json` は、ハードキル（`taskkill /F`）やマシンごと落ちたときに
残る。`process.on("exit", unregisterInstance)` は走らないので、これは想定内 —— 読んだ側が掃除する
設計になっている。掃除の判定が `isProcessAlive(pid)`、つまり `process.kill(pid, 0)` だけ。

**OS はその pid を後から別プロセスに配る。** 報告者のマシンでは実際に `svchost.exe` と
`csrss.exe` が同じ番号を引き当てていて、そうなるとこのエントリは**永久に生きた peer に見える**。
起動のたびに「already running」と言われ、以後ずっとそうなる。

## リポジトリは既にこれを知っている

`bin/port-owner.js:7`:

> the pid is alive — says nothing; a crashed server leaves its file and pids get reused

`bin/stop.js:32`:

> A LIVE PID IS NOT AN IDENTITY. …
> The registry has always tolerated that, **because its only reader asked a harmless question
> ("is one already running?")**.

#2090 はその最後の一文の反証。無害ではなかった。#1820 は `stop` の側だけを直し（`confirmInstance`
= カーネルにポートの所有者を聞く）、レジストリ本体は据え置かれた。

## 判定はカーネルに聞く、が null と [] は別の答え

`portOwners(port)` は `number[] | null` を返す。**null は「聞けなかった」、`[]` は「誰もいない」**。
`bin/port-owner.js` が既にこの区別を設計として書いている。

`registerInstance` は **`server.listen()` のコールバックの中**で呼ばれる（`server/index.ts`）。
つまり**エントリが存在する時点でそのポートは必ず bind 済み**で、「エントリがあるのに所有者がいない」
は起動レースではなく確実に死亡を意味する。ここに窓は無い。

**null のときは残す。** これは `stop.js` の `confirmInstance` と**逆向き**で、意図的:

| | 「聞けなかった」ときの危険 | だから |
|---|---|---|
| `stop` | 他人のプロセスに SIGTERM を送る | fail-closed（送らない） |
| ここ | #1061 の二重起動警告を失う | fail-open（残す） |

同じ質問に違う方針を当てているので、両方にその理由を書く。統一してはいけない。

## 設計

- `liveInstances()` は**同期のまま・挙動そのまま**。`server/agents/{copilot,cursor}-hooks-file.ts`
  が同期のパスから呼んでいて、async 化は別物の変更になる。
- `servingInstances(instances, deps)` を足す。pid がそのポートを今も所有しているエントリだけを返し、
  **積極的に否定できたものはファイルごと消す**。消すので、同期の読み手（server の prune cutoff、
  2つの hook poster）も次に読んだときには正しくなる。
- ランチャーの `confirmNoRunningInstance` がこれを通す。コストは**レジストリが空でないときだけ**
  lsof / PowerShell を1回。普段はエントリ0なのでゼロ。

`canBind` で代用しない: あれは `BIND_HOST` しか見ないので、`MULMOTERMINAL_HOST` の違う peer を
死と誤判定して #1061 を再発させる。`portOwners` はポート番号だけで聞くのでアドレスに依存しない。

## この PR が**直さない**もの

- **1回のブート内での server 側の読み**。`server/index.ts` の prune cutoff と2つの hook poster は
  未確認のエントリを読む。`server.listen()` のコールバックを async 化するのは1000行のブート手順の
  順序を変える話で、釣り合わない。ファイルが消えることで次から正しくなる、という間接的な救済に
  留める（`yarn dev` だけを使う開発者はランチャーを通らないので、そこだけ残る）。
- **`stop.js` の `confirmInstance`**。既に正しく、null 方針が違うので共有しない。

## 検証

- `test/bin/instances.spec.ts` に追加。所有者が一致 / 別 pid が所有 / 誰も所有していない /
  聞けなかった（null）/ port が null、の5方向。ファイルが消えたか・残ったかまで見る。
- 実機: 生きている他人の pid を指すエントリを置いて、ランチャーが「already running」と言わずに
  普通に先へ進み、エントリが消えていることを確認する。
