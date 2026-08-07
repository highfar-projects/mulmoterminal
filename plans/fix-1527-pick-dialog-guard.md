# fix: フォルダ選択ボタンの連打で OS ダイアログが連打分だけ開く（#1527）

## User Prompt

> 新規セルをひらくときに「Working directory」でOSのdirを開くときに、ボタン連打すると、
> 複数のOS側のファイル参照が開くのはバグかな。mac/chromeでは発生する
>
> すすめる

## 診断

多重実行ガードが経路のどこにも無い。

- `src/components/CellLaunchForm.vue:601-609` のフォルダボタンは pending 中も `disabled` にならない
- `src/composables/pickPaths.ts` に in-flight 判定が無い
- `server/files/pick-file.ts:225` はリクエストごとに `osascript` / `powershell` / `zenity` を spawn する

ネイティブダイアログは**ユーザーが閉じるまで応答しない**（`pickPaths.ts` のコメントどおり
タイムアウトは意図的に無い）ので、クリックした回数だけダイアログが積み上がる。ダイアログを作るのは
サーバー側なので Chrome 固有ではなく、mac ならどのブラウザでも起きる。

副次的に、複数のレスポンスが順不同で返るため **最後に閉じたダイアログの結果がフィールドを上書きする**
race もある。

`pickPaths` は共有モジュールで、3 つの呼び出し元すべてが同じ穴を持つ:

| 呼び出し元 | 場所 |
| --- | --- |
| セル起動フォームの Working directory | `CellLaunchForm.vue:283` |
| ヘッダーの "Insert a file path" | `useHeaderAction.ts:27` |
| 通知サウンドの Browse | `NotificationSoundsSection.vue:98` |

## 採る案

**OS のダイアログは 1 台に 1 つしか無い。だから状態も 1 つ**にする — ボタンごとの pending フラグでは
なく、`pickPaths` が持つ 1 つの状態を全ボタンが読む。

1. `pickPaths.ts` に module 単位の `dialogOpen` を持ち、`filePickerOpen` として readonly で公開する。
   - 開いている間に来た呼び出しは **キャンセルと同じ** `{ paths: [], error: null }` を返す。
     呼び出し元は既に「空配列なら何もしない」実装なので、追加の分岐が要らない。
   - `finally` で必ず解除する。fetch が投げても、500 でも、次のクリックは効く。
2. フォルダボタン（`CellLaunchForm.vue`）と Browse ボタン（`NotificationSoundsSection.vue`）を
   `filePickerOpen` で `disabled` にする。ガードだけだと「押したのに無反応」に見えるため。

### 却下した案

- **同じ Promise を共有する**（2 回目の呼び出しに 1 回目の結果を返す）: `directory: true` を求めた側に
  ファイルのパスが返り得る。ダイアログは 1 つでも、答えの意味が呼び出し元ごとに違う。
- **ボタン側だけの pending ref**: 3 箇所に同じ 3 行を書くことになり、キーボード操作や別ボタンの
  同時押しでは依然として 2 枚開く。根本原因は共有モジュール側にある。

### ヘッダーボタンを disabled にしない理由

`useHeaderAction` の "Insert a file path" は汎用のヘッダーボタン設定から生えており、この 1 アクション
のためだけに disabled 状態を通す配線は割に合わない。多重ダイアログ自体は `pickPaths` のガードで
止まるので、症状は残らない（押しても何も起きないだけ）。

## テスト

- `test/src/composables/pickPaths.spec.ts`
  - ダイアログが開いている間の呼び出しは fetch せず、キャンセルとして返る
  - 解決後は再び開ける（フラグが張り付かない）
  - fetch が投げた後も再び開ける
- `test/src/components/CellLaunchForm.spec.ts`
  - ダイアログが開いている間、フォルダボタンが disabled になる
