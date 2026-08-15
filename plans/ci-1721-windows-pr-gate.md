# ci: Windows のゲートを PR 前にも置く (#1721)

## 問題

`windows-daily.yaml` は `pull_request` で走らない。結果として **Windows の移植性ミスは必ず
main に着地してから見つかる**。issue 一覧に 15 件残っている:

#478 #802 #816 #858 #934 #1079 #1212 #1267 #1396 #1459 #1481 #1484 #1539 #1653 #1709

#1653 は赤が続いた間に**別の失敗が 5 件積み上がった**。直近の #1719 もこの形。

大半は**テスト側の移植性バグ**（POSIX パスリテラル、`chmod`、`HOME` と `USERPROFILE`、
`fs.watch`、タイムアウト）で、**PR 時点で走れば確実に捕まる種類**。

## 設計

`.github/workflows/windows-pr.yaml` を新設。`windows-daily.yaml` は残す。

| | windows-pr | windows-daily |
| --- | --- | --- |
| 契機 | `pull_request` | schedule / push:main / dispatch |
| 実行 | **`yarn test` のみ** | lint + typecheck + build + test |
| Node | 22.x のみ | 22.x と 24.x |
| 目的 | マージ前に移植性回帰を止める | 広く見る |

### なぜ lint / typecheck / build を回さないか

**プラットフォームによって答えが変わらないから。** `ci.yml` が ubuntu と macOS で既に回している。
Windows で挙動が変わるのは `yarn test` だけなので、PR ごとに払う価値があるのもそこだけ。
これが「全 PR に載せられる安さ」の理由そのもの。

### なぜ paths のホワイトリストではなく `paths-ignore` か

**当初 issue では「`server/infra/**` `server/session/**` `test/server/**` を触る PR だけ」を
提案したが、調べたら成り立たない。** プラットフォームで分岐する spec は 9 ディレクトリに散っていて、
`test/src/components/` もその 1 つ（#1719 がそこ）。

```
test/scripts/  test/server/agents/  test/server/backends/  test/server/backends/remoteHost/
test/server/config/  test/server/files/  test/server/infra/  test/server/rooms/
test/server/routes/  test/server/session/  test/src/components/
```

ホワイトリストは**次に Windows 依存の spec を足す人が更新しなければならず、忘れた場合の
failure mode が「沈黙」**になる。`BUNDLED_SKILL_NAMES` と同じ罠。

**Windows のテスト結果に影響し得ないと証明できるのは docs / plans / markdown だけ**なので、
`windows-daily.yaml` が既に使っている `paths-ignore` をそのまま使う。

### キャッシュ

`node_modules` のキーは `windows-daily.yaml` のものと**同一文字列**（`win-node-modules-22.x-<lockfile hash>`）。
PR ブランチは default branch のキャッシュを読めるので、main が作った tree をそのまま復元できる。

## 併せて直したもの（#1721 の範囲外）

`.github/workflows/` の 8 本のうち **`ci.yml` だけ `permissions:` が無かった**（他 7 本はある）。
CodeQL の "Workflow does not contain permissions" 対象。両ジョブは checkout / install / lint /
typecheck / build / test / pack-install-boot だけで、リポジトリにも API にも書かないので
`contents: read` で足りる。`persist-credentials: false` も checkout 2 箇所に足した。

**8 本目を permissions 付きで足しながら、既存の 1 本の抜けを残すのは筋が通らない**ので同じ PR に
入れた。分けたければ切り出せる。

## 検証

**この workflow は自分自身の PR で走る。** `pull_request` 契機は `workflow_dispatch` と違って
default branch にある必要が無いため（`workflow_dispatch` はある — #1721 とは別の制約）。

見るべきもの:

1. `Windows (PR)` が PR に現れて緑になる
2. **実行時間**。これが「全 PR に載せてよいか」の判断材料で、issue の時点では未測定だった
3. docs だけの PR では走らないこと（`paths-ignore`）

所要時間が許容できなければ、ホワイトリストではなく **`yarn test` の対象を絞る**方向で再検討する
（ホワイトリストが腐る理由は上記のとおり変わらない）。
