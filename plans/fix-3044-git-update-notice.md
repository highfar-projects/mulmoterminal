# fix(cli): git のチェックアウト向けの更新案内に install・build・再起動を入れる (#3044)

## いま

clone 向けの更新の知らせ（起動時のコンソールと更新バッジ）は `run: git pull origin main` だけ。
案内どおりにすると、サーバー側のコードだけが新しくなり、依存とブラウザ側のビルドは古いまま残る。知らせは HEAD と
リモートの比較なので、`git pull` した時点で消え、更新が済んだように見える。

## 直し方

- `bin/update-check.js` の `gitUpdateNotice`: 命令を `<pull> && yarn install && yarn build` にし、「(restart after
  updating)」を `run: ` より前に置く。バッジは `run: ` より後ろをコピーするので、コピーされるのは命令だけ
  （`src/composables/updateNotice.ts` の `parseUpdateNotice`）。
- README の説明を合わせる。

## 範囲外

- `git pull` 済みで install / build が済んでいない状態を検出して知らせること。
