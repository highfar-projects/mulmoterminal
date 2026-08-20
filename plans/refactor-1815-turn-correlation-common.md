# ターン相関の純関数を `common/` へ（#1815 PR0）

Campaign Mode（#1815）の runner はサーバ側に置く。runner が待つのは
「送った文字列が相手の次の prompt に現れたターン」という、ブラウザ側の
round table / cross-talk が既に使っている判断そのものである。
その純関数がいま `src/composables/exchangeRules.ts` にあり、
`tsconfig.server.json` は `src/` を include しないので **サーバから import できない**。

CLAUDE.md の `common/` 規則がそのまま当てはまる:

> a value or wire type that BOTH sides decide from ... belongs here — never mirrored
> into `server/` and `src/` with a "keep the two copies in sync" comment.

## 何を動かすか

`common/turnCorrelation.ts` を新設し、次を移す。

| 記号 | 種類 |
| --- | --- |
| `TurnSnapshot` | 型 |
| `CORRELATION_TAIL` | 定数（非公開のまま） |
| `collapse` | 非公開ヘルパ |
| `answersOurSend` | 関数 |
| `WaitVerdict` | 型 |
| `waitVerdict` | 関数 |

`src/composables/exchangeRules.ts` に残すのは `ExchangeOutcome` と `outcomeMessage`。
これは**セルに出す文言**であり、サーバは判断しない。CLAUDE.md の
「両側が違うなら共通の芯だけ共有し、各側の付加物は手元に置く」に従う。

再 export はしない（CLAUDE.md: NEVER re-export modules）。import 元 6 箇所を書き換える。

| import 元 | 移動後 |
| --- | --- |
| `src/composables/useRoundTable.ts` | `waitVerdict` → `common/turnCorrelation` |
| `src/composables/useCrossTalk.ts` | `waitVerdict`, `TurnSnapshot` → `common/turnCorrelation`、`ExchangeOutcome` は現状のまま |
| `src/components/TerminalCell.vue` | 変更なし（`outcomeMessage` のみ） |
| `test/src/composables/exchangeRules.spec.ts` | `outcomeMessage` だけ残す |
| `test/common/turnCorrelation.spec.ts`（新規） | 移した関数のテストを移設 |
| `test/src/composables/roundTableRules.spec.ts` | `answersOurSend` → `common/turnCorrelation` |

`test/common/roomMessage.spec.ts` も `src/composables/exchangeRules` から
`answersOurSend` を import している。`common/roomMessage.ts` 自身のコメントが
`answersOurSend` を根拠に「会話は最後に置く」と書いているので、
`common/` のテストが `src/` に手を伸ばしている今の形は、この移動で解消する。

## ふるまいは変えない

純粋な移動であり、コードの中身は1文字も変えない。CLAUDE.md の
「this behaves the same は両方走らせて証明する」に従い、
旧実装を verbatim にコピーした使い捨てハーネスで、生成入力に対して
新旧を突き合わせる。**変異検証**（新側を1語だけ壊して差分が出ることの確認）まで行う。

## やらないこと

- `RoundTableDeps` / `CrossTalkDeps` の形の整理。触ってよいとは合意済みだが、
  統合が暫定という経緯があるので、ふるまい保存の移動と混ぜない。別 PR。
- `outcomeMessage` の `common/` 化。サーバが必要としたときに、必要な形で。
