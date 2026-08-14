# fix #1709 — 公開ビューの symlink 防御が Windows で効いていない

## 症状

`windows-daily` が 2026-08-13T20:02 から赤。`publicView.spec.ts` の 3 件が
`expected true to be false` で落ちる — `readAppViewFile` が拒否せず成功している。

## 原因は 2 つある

### 1. symlink 防御が Windows で無効 (実装の穴)

`openContained` の防御は `O_NOFOLLOW` 一本:

```ts
handle = await open(full, constants.O_RDONLY | constants.O_NOFOLLOW);
```

`O_NOFOLLOW` は Windows に存在しない。`constants.O_NOFOLLOW` が `undefined` になり、
`|` は `undefined` を 0 として扱うので、この式は**素の `O_RDONLY` に黙って劣化する**
(macOS では 256、`O_RDONLY | undefined === 0` を実測)。エラーも警告も出ない。

**同じファイルの中に決定的な傍証がある**: 中間ディレクトリのリンクを見る
`symlinkedAncestor` は `lstat` ベースで、その spec は **Windows で通っている**。
落ちているのは最終要素、つまり `O_NOFOLLOW` に頼っている方だけ。

これはテストだけの問題ではない。公開先は `allow read: if true` のドキュメントで、
`publicView.ts` 自身が「what gets published is world-readable」と書いている。
Windows では `views/leak.html` がリポジトリ外を指すリンクなら、その中身が世界に出る。

### 2. `chmod 0o000` は Windows で読めるまま (テストの前提が作れない)

`docs/windows-gotchas.md` が既に処方済み。NTFS に POSIX パーミッションビットは無く、
`chmodSync(f, 0o000)` は read-only 属性を動かすだけで**読めてしまう**。
前提が作れない以上そこでは何も検証していないので、#1484 と同じく win32 で skip する。

## 直し方

### 最終要素も `lstat` で見る (全プラットフォーム)

`openContained` の open の前に `lstat` し、symlink なら拒否する。

- **POSIX**: `O_NOFOLLOW` は従来どおり残す。race まで塞ぐ本命はそちらで、この `lstat`
  は上積み。効果はメッセージが具体的になること (「開けなかった」ではなく「リンクだ」)
- **Windows**: これが唯一の防御になる。race は残るが、それは同ファイルが中間
  ディレクトリについて既に受け入れ・明記している制約と同じもの — MISTAKE
  (誰かが置いた迷子のリンク) は完全に塞ぎ、リポジトリへの書き込み権を持つプロセスとの
  race は塞がない
- **プラットフォーム分岐にしない**。分岐にすると Windows 側の経路が macOS/Linux の CI で
  一度も実行されず、壊れても daily まで誰も気づかない

あわせて `constants.O_NOFOLLOW ?? 0` と名前付き定数にし、**フラグが黙って消えることを
コードの上で見えるようにする**。0 になる事実そのものが今回の原因なので、無名の 0 に
戻してはいけない。

### メッセージ

新しい拒否は「リンクである」ことを言う。既存テストが期待する
`without following links` は引き続き含める。generic な
`could not be opened as a plain file` は「パスが何も指していない」ケース専用のまま残す。

## 検証

**手元の macOS では 3 件とも通ってしまい、何も見えない。** `windows-daily.yaml` は
`workflow_dispatch` を持つので、feature ブランチに対して実機で実行して確認する。
