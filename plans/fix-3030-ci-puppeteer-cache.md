# fix(ci): ubuntu / macOS のテストジョブでも puppeteer の Chrome をキャッシュする (#3030)

## 何が起きていたか

`ci.yml` の `test` ジョブ（ubuntu / macOS × 3 シャード）は `node_modules` をキャッシュしているが、
puppeteer が install 時に Chrome を落とす先 `~/.cache/puppeteer` は `node_modules` の外にある。
そのため新しいランナーでは毎回、Chrome（lockfile にある puppeteer 2 版ぶん）をダウンロードし、
macOS では `unzip` コマンドで展開している（`@puppeteer/browsers` の `fileUtil.js`、`extractZipWithCli`）。
macOS のシャードで 2 回、`yarn install` の Building fresh packages で 18 分止まり、`unzip` が
残ったまま打ち切られた。

## 決めたこと

| 論点 | 決定 |
| --- | --- |
| 直し方 | A: `~/.cache/puppeteer` を install の前に戻す（#3030 でユーザーが選択） |
| キー | `puppeteer-${{ runner.os }}-${{ hashFiles('yarn.lock') }}`。`windows-pr.yaml` / `windows-daily.yaml` と同じ |
| 保存と復元の分け方 | 全シャードが `actions/cache`（保存あり）。止まるのはダウンロードそのものなので、キャッシュの無い run で 1 番目のシャードが止まっても、通ったシャードが保存できるようにする（CodeRabbit）。同じキーへの 2 回目以降の保存は重複として断られるだけ |
| 対象 | `ci.yml` の `test` ジョブだけ。`checks` と `package-smoke` は Chrome を起動しないので今回は触らない |

`@puppeteer/browsers` は展開先に実行ファイルがあればダウンロードしない（`install.js` の
`existsSync(outputPath)` の分岐）ので、キャッシュが当たれば install の Chrome 部分は何もしない。

## 確かめ方

- PR の CI で、`test` のどれかのシャードが新しいキーを保存すること（初回は外れて当然）
- その後の run（再実行）で、ubuntu / macOS の各シャードが `Cache restored from key: puppeteer-…` になること
- Chrome を起動するテスト（`headlessPreview.spec.ts` など）が飛ばされず走っていること
