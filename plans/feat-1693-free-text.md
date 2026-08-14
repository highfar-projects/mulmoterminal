# 質問ペインから自分の言葉で答える (#1693)

選択肢のどれでもないことを言いたいとき、いまはターミナルに切り替えるしかない。

## 実測が設計を決めた（そして一度読み違えた）

ダイアログの `Type something` は**テキスト入力欄**。カーソルを合わせてから打つと、その行が
打った文字に変わり、Enter で**答えとして**確定する:

```
❯ 3. green please               ← 打った文字がそのまま行になる
⎿ · Red or blue? → green please  ← 答えとして届く
PostToolUse answers = {"Red or blue?": "green please"}
```

**最初はこれを「辞退」と読み違えた。** 空のまま Enter を押すと `User declined to answer questions`
になるので、そこだけを見て「Type something = 辞退」と決めてしまい、「辞退してから普通の
メッセージを送る」という別物を作った。実機で「押しても何も入らない」と報告されて測り直すまで、
テストも lint も CI も全部緑のままだった。

行は、画面に出ている質問（＝最初の質問）の `options` の直後。

## 実装

選択肢を押すのと**同じ行為**なので、同じ経路を通す:

- `common/askQuestion.ts` — `keysToAnswerInWords(questions, text)`。`options.length` だけ下って、
  テキストを書いて、Enter
- `answerQuestion` — `picks` の代わりに `text` を受ける。#1690 の保護（直列化・本人の入力への
  譲り・送信済みの主張・部分送信の押さえ）はそのまま効く
- **テキストはホストで sanitize する。** クライアントが送るもので唯一「整数のインデックス」で
  ないので、`sanitizeTerminalInput`（#445 から電話の打鍵が通っている経路）を再利用する。
  これが無いと ESC や bracketed paste 終端を他人の端末に送り込める
- 空文字は拒む。**空のまま Enter は「辞退」になってしまう** — 自分の言葉で答えようとした人が
  いちばん望まない結果

## 範囲外

電話側の UI（コマンドは同じ形で受ける）。`Chat about this`。
