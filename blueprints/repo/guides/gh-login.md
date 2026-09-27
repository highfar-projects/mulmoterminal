# GitHub の gh にログインする

このあと、変更を GitHub に送って PR を作り、マージまで進めます。そのために `gh` というコマンドに一度ログインします。

1. ターミナルで `gh auth login` を実行します。
2. 「GitHub.com」→「HTTPS」→「Login with a web browser」を選びます。
3. 表示された 8 文字のコードを控え、Enter を押すとブラウザが開きます。
4. ブラウザでコードを入れ、「Authorize」を押します。

**うまくいったかの見分け方**: `gh auth status` に `Logged in to github.com` と出ます。

終わったら「済み」と返信してください。
