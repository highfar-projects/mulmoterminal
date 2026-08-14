# 質問ペインから「その他」で答える (#1693)

選択肢のどれでもないことを言いたいとき、いまはターミナルに切り替えるしかない。

## 実測が設計を決めた

`Type something` は**入力欄ではない。質問を辞退して、普通のプロンプトに戻る。**

```
❯ 3. Type something.
⏺ User declined to answer questions
  ⎿  · Pick a colour: red or blue? (Red / Blue)
❯                        ← 普通の入力欄
```

複数問でも同じで、**1問目で選ぶと全体が辞退される**（辞退の一覧に両方の質問が並ぶ）。
行は `options` の直後、つまり最初の質問の `options.length`（0 始まり）。

**辞退では hook が飛ばない。** `PostToolUse` も `PostToolUseFailure` も来ず、`PreToolUse` だけ。
tool-call の記録は `running` のまま残る — ユーザが実機で見つけた「答えないで次に進むと消えない」
の正体はこれ。#1690 の「`openQuestionOf` は履歴の最後の1件だけを見る」がこの場面で効く。

## だから「その他」は2段になる

1. **辞退**（ホストがキー列を送る）
2. **テキストを普通のメッセージとして送る**

そして 2 は**新しい経路を作らない**。web は `submitText`、電話は `sendTerminalInput` を既に持って
いて、どちらもサニタイズ済み・エージェント別の submit バイトまで解決済み。ホストに「テキストを
受け取って端末に書く」口を新設すると、#1685 で引いた「クライアントは整数だけ送る」という境界に
穴を開けることになるので、そうしない。

つまりホストに増えるのは **`decline`（キー列だけ）** ひとつ。#1690 の保護（直列化・本人の入力への
譲り・送信済みの主張・部分送信の押さえ）はそのまま効く。

## 実装

- `common/askQuestion.ts` — `keysToDecline(questions)`。最初の質問の `options.length` だけ下って Enter
- `answerQuestion` — `picks` の代わりに `decline: true` を受ける形。以降の経路は同じ
- `POST /api/question/:sessionId/answer` — `decline` を受ける
- ペイン — 自由入力欄。送信で `decline` → 成功したらテキストをターミナルに送る（グリッド経由）
- RemoteHost の `answerQuestion` も `decline` を受ける（電話の UI は別 issue）

## 範囲外

電話側の UI。`Chat about this`（辞退の下にもう1行あるが、用途が違う）。
