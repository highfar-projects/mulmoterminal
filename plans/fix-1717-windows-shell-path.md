# fix: Windows で Shell セルが起動しない — 空白を含む shell パスが PowerShell に素で渡る (#1717)

## 症状

Windows で Shell セルを起動すると即座に落ちる。

```
C:\Program : 用語 'C:\Program' は、コマンドレット、関数、スクリプト ファイル、または操作可能な
プログラムの名前として認識されません。
```

Claude / Codex セルは同じ環境で正常に起動する。Shell セルだけが落ちる。

## 根本原因

2 つの独立した箇所が合流して壊れている。

**1. `server/routes/ws-routes.ts:107`**

```ts
const DEFAULT_LAUNCH_CMD = process.env.SHELL || "/bin/sh";
```

これは**実行ファイルのパス**であって、コマンドラインではない。Git for Windows が入っていると
`process.env.SHELL` は `C:\Program Files\Git\usr\bin\bash.exe` になる。

**2. `server/session/shell-command.ts:19`**

```ts
if (platform === "win32") return { shell: "powershell.exe", args: ["-NoLogo", "-Command", command] };
```

`-Command` の引数は PowerShell が**コードとして解析する**。渡ったのが素のパスなので、
最初の空白で切れて `C:\Program` がコマンド名、`Files\Git\usr\bin\bash.exe` が引数になる。

POSIX 側は `$SHELL` に空白が無いという偶然で通っていただけで、設計としては同じ穴が空いている。

さらに `/bin/sh` フォールバックは Windows では `<drive>:\bin\sh` に解決され、何も指さない
（`windows-gotchas.md` の「POSIX absolute paths silently become drive-relative」そのもの）。

## いちばん危険な罠 — 引用符だけでは直らない

PowerShell で `'C:\Program Files\...\bash.exe'` は**ただの文字列式**で、実行されずにパスが
表示されるだけ。実行するには**呼び出し演算子 `&` が要る**。

| `-Command` に渡すもの | 起きること |
| --- | --- |
| `C:\Program Files\...\bash.exe` | 空白で分割され `CommandNotFoundException`（現状のバグ） |
| `'C:\Program Files\...\bash.exe'` | **パスが表示されるだけでシェルは起動しない** |
| `& 'C:\Program Files\...\bash.exe'` | 起動する |

真ん中が「引用符を足す」という素直な修正の結果で、**エラーが出ないぶん今より悪い**
（セルは開くがシェルが無い＝ハングに見える）。ここを外すと直したつもりで壊れる。

## 直し方

**空白を含むかどうかで分岐しない。** 常に `&` + 引用符を通す。分岐はユーザーの書いた文字列を
推測する行為で、CLAUDE.md がランチャーチップで禁じているのと同じ間違いになる。

### 1. `server/infra/shell-quote.ts`（新規）

PowerShell の単一引用符エスケープは**既に `server/config/header-resolve.ts` の `shellQuoteFor` に
ある**（ヘッダーボタンの `${branch}` 置換用）。2 つ目のコピーを書かない。`cmd-escape.ts` の隣、
infra に移してどちらからも使う。セキュリティに関わる引用規則の定義は 1 つでなければならない。

```ts
export function shellQuoteFor(platform)          // header-resolve から移動
export function runExecutableCommand(execPath, platform)  // 新規: & 'path' / 'path'
```

`header-resolve.ts` は再エクスポートしない（CLAUDE.md）。import 元を全て書き換える。

### 2. `server/session/shell-command.ts`

```ts
export function defaultShellCommand(platform, env): string
```

- win32 以外: `SHELL` → `/bin/sh`
- win32: `SHELL` → `ComSpec` → `powershell.exe` を `runExecutableCommand` に通す

env の読み出しは `pty-env.ts` の `envValue`（大文字小文字を無視）を使う。Windows の
`process.env` は case-insensitive だが、テストが渡す素のオブジェクトはそうではない。

**どのシェルが起動するかは変えない。** `SHELL` が設定されていればそれを尊重する。報告者は
bash が起動しないことを問題にしているのであって、bash であることを問題にしていない。
Windows で常に PowerShell を起動する案もあるが、それは別の判断なので PR で提起する。

### 3. `server/routes/ws-routes.ts`

`DEFAULT_LAUNCH_CMD` を `defaultShellCommand(process.platform, process.env)` に置き換える。

## 検証

**このホストに PowerShell が無い。** ローカルで確認できるのは純粋関数の出力だけで、
「PowerShell が実際にどう解釈するか」は推測になる。上の表の真ん中の行こそが推測で外しやすい
ところなので、**実機で確かめないまま直したと言わない**。

**`windows-daily.yaml` は `pull_request` で走らない**（`schedule` / `push: main` /
`workflow_dispatch` のみ）。PR が緑でも Windows については何も証明していない。

1. 純粋関数のテスト（どのホストでも走る）— `test/server/session/shell-command.spec.ts`
   - 空白入りパス / 引用符入りパス / `SHELL` 未設定 / POSIX 側が変わらないこと
2. **実 PTY テスト（Windows のみ）** — `test/server/session/shell-spawn-win.spec.ts` に追加。
   既に PowerShell を実 PTY で回す基盤がある。
   - ランナーのイメージに依存しない決定的な再現を作る: `mkdtemp` の下に**空白を含む名前の
     ディレクトリ**を作り、トークンを出力する `.cmd` を置き、そこを `SHELL` に見立てる
   - **素のパスが失敗することも同時に固定する。** 直った側だけ見ても、バグが本当にそれだったか
     は分からない
3. `gh workflow run windows-daily.yaml --ref fix/1717-windows-shell-path` を**修正前に一度**
   走らせて赤を確認し、修正後にもう一度走らせて緑を確認する。

## 併せて洗った Windows 関連箇所（結果: 追加修正なし）

| 箇所 | 判定 |
| --- | --- |
| `server/infra/cmd-escape.ts` | cmd.exe 用の引用。`resolve-bin` 経由でバッチシムに使われる。健全 |
| `server/infra/resolve-bin.ts` | `namesAPath` で分岐し、パスは argv として渡す。第 2 パーサを通さない |
| `server/config/header-resolve.ts` | `shellQuoteFor` で値を引用済み。実行ファイルパスは扱わない |
| `server/files/pick-file.ts` / `win-folder-dialog.ts` | `powershell -Command <script>` だが、パスはスクリプト内で引用済み |
| `server/files/open-dir.ts` | `explorer` を argv で spawn |
| `server/session/session-settings.ts` | `escapeBatchArgument` 経由 |
| `shell: true` の spawn | **ゼロ**（第 2 パーサを勝手に挟んでいる箇所は無い） |

`process.env.SHELL` を読むのは 3 箇所だけで、いずれも本 PR が触る 2 ファイル。
