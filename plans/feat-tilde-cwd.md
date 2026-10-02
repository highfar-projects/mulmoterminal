# feat: 起動ディレクトリに `~` を書けるようにする (#2841)

## 問題
起動フォームの `~/ss/hello-sharedapp` が `server/config/workspace.ts` の絶対パス判定で拒否される。

## 方針
- `existingWorkspace` / `workspaceRequest`（と内部の `unusableWorkspace`）で、判定の前に先頭の `~` を `expandTilde`（`server/files/pathContainment.ts`）で展開する。
- `~` 単体と `~/` 始まりだけを展開。`~name`・途中の `~` は従来どおり「絶対パスでない」で拒否。
- 返す値は従来どおり正規化した絶対パス。セルはサーバが返す cwd を採用するので、表示や dir-config の鍵は展開後のパスに揃う。
- テストのためにホームディレクトリを引数で差し替え可能にする（既定は `os.homedir()`）。

## 範囲外
- クライアント側での展開（サーバが正規化した cwd を返すため不要）。
- `~name`（他ユーザーのホーム）の解釈。
