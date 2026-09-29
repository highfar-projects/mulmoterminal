# feat: a question can carry a default the form fills in (#2507)

## 問題

「文書を書く」から「文書を整える」へ進むと、書いた文書と規約は入るが、「今回整えるファイルの数の上限」が空で「始める」が押せない。書いたばかりの 1 つの文書を整えるのに上限の数を考えさせるのは手間。

## 方針

- hearing の質問に `default`（答えと同じ型）を足す。`hearingProblems` は、default がその質問自身に受け付けられない値なら問題として返す。スキーマの読み込みで弾くので、インストールしたパックも誤った default は持ち込めない。
- `defaultAnswers(hearing)`（`common/blueprint/hearing.ts`）は、default のある質問の答えだけを返す。
- フォームは組み合わせを読み込んだ時点で default を入れる。例の答えや引き継ぎの答えはその上に重なる（同じ質問ならそちらが勝つ）。組み合わせを変えると、新しい組み合わせの default になる。
- `polish.maxFiles` は 5、`refactor.maxChanges` は 3。使う人の数や予算（`internal`）のように本人しか知らないものには付けない。

## レビューで足したもの

- サーバーの作成経路も default を入れる（`requiredDefaults`）。ただし必須の質問だけ。任意の質問を空で送ったのは「無し」という答えなので、default で上書きしない。
