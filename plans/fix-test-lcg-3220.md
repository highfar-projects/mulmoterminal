# fix: 生成入力の spec の生成器を一つにし、倍精度の丸めで縮んだ周期をなくす

Issue: #3220

## 問題

`test/` の生成入力の spec は、失敗を種から再現できるように自前の線形合同法で入力を作っていた。その一歩 `state = (state * 1103515245 + 12345) % 2147483648` は倍精度では積が丸められ、状態が 64 の倍数に張り付いて周期が一万数千に落ちる。下位 bit を直接読んだ #3216 の spec は数通りの入力に潰れ（同 PR で修正）、割り算や上位 bit で読む残りの spec は一回ごとの散らばりこそ保つものの、周期を超えて引く三本（`transcript-view-codex`、`filePathMatch`、`codeBlocks`）は後半の試行が前半の繰り返しになっていた。測り方と数字は issue にある。

## 方針

- **生成器を一つにする**: `test/helpers/seededRandom.ts`。一歩は `Math.imul` で 32 bit に収め、値は上位 bit から取る（`fraction()` は [0, 1) の小数、`below(bound)` は [0, bound) の整数、`pick(choices)` はその一つ）。#3216 の spec が使っていた算術と同一なので、その spec の入力は変わらない。
- **自前の一歩を全部消す**: 一歩を写していた 12 箇所（`previewCodeNumbering.spec.ts` の BigInt 版も含む）を helper に向ける。写しが残っていないことは helper の spec が spec の置き場（`test/` の全 `.ts` と、`src/`・`server/`・`bin/` に同居する `.spec.ts`）を走査して固定する（乗数を綴ったファイルが helper 一つだけであること。綴りは十進・BigInt・桁区切り・16 進を見る。計算や分割で作った乗数は写しではないので見ない）。走査する置き場は `vitest.config.ts` の `include` と突き合わせる。
- **届く範囲を assertion にする**: 生成器の契約（同じ種は同じ列、定数が固定する列そのもの（黄金値）、範囲、小さな上限の全値に届く、十万回で巡回しない、上限は正の整数）は helper の spec に一度だけ置く。各 spec には、その spec が言っている入力空間を実際に踏んだこと（全部の片・全部の長さ・全部の agent、など）を足す。周期の退化で半分が重複していた二本には「生成列の過半が別物」を足す。
- **入力が変わる**: 生成器を替えれば生成される入力も変わる。性質が広がった入力で初めて赤になるものがあれば、それは退化していた間に見えていなかった発見として別に扱う（この PR で直さない）。

## 変更

- `test/helpers/seededRandom.ts`（新規）、`test/helpers/seededRandom.spec.ts`（新規、契約と走査）
- 一歩を helper に置き換えた spec と helper: `test/server/config/on-disk-entry.spec.ts`、`test/src/components/anchoredMenuFocus.spec.ts`、`test/common/themeVars.spec.ts`、`test/common/codeBlocks.spec.ts`、`test/src/components/filePathMatch.spec.ts`、`test/server/session/pty/terminal-replay.spec.ts`、`test/server/session/pty/agent-pty-start.spec.ts`、`test/server/session/transcript/transcript-view-codex.spec.ts`、`test/src/composables/terminalBufferHealth.spec.ts`、`test/helpers/widthSamples.ts`、`test/server/files/previewCodeNumbering.spec.ts`、`test/server/backends/plugins/markdownPdf.spec.ts`

## 検証

- 置き換えた spec を一本ずつ回し、足した届く範囲の assertion が通ること。
- `tmuxWidthProbe.spec.ts` は実際の tmux と幅を突き合わせる。乱数の見本が変わるので、新しい見本で不一致が出ないことを手元の tmux で確認する。
- helper の spec の走査は、どこかの spec（同居する spec も含む）に一歩を書き戻すと赤になることを確認する。
- `yarn format` → `yarn lint` → `yarn typecheck` → `yarn build` → `yarn test`。
