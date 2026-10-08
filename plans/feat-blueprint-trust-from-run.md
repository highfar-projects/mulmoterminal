# feat: a build stopped for an untrusted folder can open Claude Code there (#2469)

## 問題

#2467 で、始めるときのフォームからは Claude Code を開けるようになった。工程の途中で「信頼していません」で止まったときは、実行画面に文が出るだけで開く手段が無い。

## 方針

- 純粋関数 `untrustedFolder(stepState)`（`src/components/blueprints/stepNoticeText.ts`）は、止まった理由の通知（`reasonNotice`）か、失敗した検査の通知（`lastCheck.notice`）のどちらかが `untrusted` なら、そのフォルダを返す。そうでなければ null。
- 実行画面の失敗した工程に、そのフォルダがあれば「ここで Claude Code を開く」を出す。押すと `openTerminalAt(dir, null, "claude")`。信頼するかは本人が答える。
- 「もう一度」はそのまま残す。答えたあとに押すのはこれ。

## 範囲外

- 答えたあと自動で「もう一度」を押すこと。信頼したかどうかは本人の判断で、次に進めるのも本人。
