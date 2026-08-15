# refactor: 自分で決めたシェルは argv で渡す (#1720)

## 背景

#1717 / #1718 で Windows の Shell セルを直したが、**第 2 のパーサー（PowerShell）を通したまま、
その規則に正しく従う**という解き方だった。`& '<path>'` は正しいが、正しさを維持し続けなければ
ならない構造が残っている。

## 根

**自分たちが決めた値を、誰かが再パースするテキストに変換している。**

`shellInvocation` がコマンド**文字列**を取るのは正しい。ランチャーチップはユーザーが書いた
コマンドラインで、パイプも `&&` も `$VAR` の展開も期待されている。**そこは文字列でなければならない。**

`DEFAULT_LAUNCH_CMD` は違う。ユーザーのコマンドラインではなく、こちらが `$SHELL` から取った
**ファイルパス**。パースされる必要が無い。

## 調べて分かったこと — issue の案そのままでは POSIX が壊れる

issue には「argv で渡す」と書いたが、**両プラットフォームで一律にやると POSIX が壊れる。**

`shellInvocation` の POSIX 分岐は `$SHELL -lc "exec <command>"` で、この **`-l` が load-bearing**。
ログインシェルとして `.zprofile` / `.bash_profile` を読み、そこで足された PATH を、`exec` した
先の対話シェルが引き継ぐ。

`/bin/zsh` を直接 spawn すると読まれるのは `.zshrc` だけになり、**ユーザーのログイン PATH が
黙って消える**。しかもこれは開発者自身の dotfiles に依存するので、**テストでは捕まらない。**

Windows 側は逆に、ラッパーが何も買っていない。`powershell -Command "& '<path>'"` は PowerShell を
起動して本命のシェルを起動させるだけで、間の文字列がパーサーとして事故を起こしていた。
**取り除いて失うものが無い**（プロセスが 1 つ減る）。

なので **Windows だけ argv 化し、POSIX はそのまま**にする。対称性ではなく、ラッパーが何のために
あるかで分ける。

## 変更

`server/session/shell-command.ts`:

```ts
export type LaunchTarget =
  | { kind: "command"; command: string }              // ユーザーが書いた行 — シェルが読む、verbatim
  | { kind: "program"; file: string; args: string[] }; // こちらが選んだファイル — 直接 spawn

export function defaultShellPath(platform, env): string       // パスを決めるだけ
export function defaultShellTarget(platform, env): LaunchTarget // win32 → program / posix → command
export function launchInvocation(target, platform, shellPath): ShellInvocation
export const launchTargetLabel = (target) => string             // ログ行用
```

`defaultShellCommand` は `defaultShellPath` + `defaultShellTarget` に分割。

`spawn-shell.ts` / `routes/ws-routes.ts` は `command: string` の代わりに `LaunchTarget` を通す
（`resolveLaunchSession` → `startLaunchEntry` → `spawnLauncherPty`）。

**ランチャーチップの経路は一切変えていない。** `{ kind: "command" }` として今までどおり
`$SHELL -lc "exec <ユーザーの行>"` を通る。

## 副産物 — 「$SHELL が無いときの既定」の不一致が消える

| 場所 | 既定 |
| --- | --- |
| `shellInvocation` の POSIX 分岐 | `/bin/bash` |
| 旧 `defaultShellCommand` の POSIX 分岐 | `/bin/sh` |

同じ問いに 2 つの答えがあった。`defaultShellPath` が唯一の決定点になり、`shellInvocation` 側の
`/bin/bash` は「コマンドを走らせるシェル」の既定として意味が分かれる。

## 検証

- 純粋関数: `defaultShellPath` / `defaultShellTarget` / `launchInvocation` / `launchTargetLabel` を
  両プラットフォーム分、どのホストからでも
- **実 PTY（Windows のみ）**: 空白を含むディレクトリに `.cmd` を作り、
  - 素のパスを PowerShell に渡すと動かないこと（旧バグの保存）
  - 引用符だけだと表示するだけで起動しないこと（沈黙する失敗の保存）
  - **`launchInvocation(defaultShellTarget(...))` で spawn すると動くこと**（新しい経路）
- `windows-daily.yaml` を branch ref に dispatch（`pull_request` では走らないため）。
  #1721 がマージされていれば PR 側でも `Windows (PR)` が回る。

`.cmd` は `resolve-bin` / `cmd-escape` 経由で cmd.exe に渡る。そこは既存のテスト済み経路で、
**ユーザーの PATH が空白を混ぜられる文字列ではなく、こちらが組む argv**である点が違う。
