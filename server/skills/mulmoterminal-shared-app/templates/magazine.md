# テンプレート: 記事を公開する（雑誌・ブログ・お知らせ・研究ノート）

**このテンプレートだけ、公開ページの HTML を書きません。** `views[].type: "article"` を宣言すると、
どのフィールドが見出しでどれが本文かを言うだけで、索引と記事ページをプラットフォームが描きます。
記事 1 本ごとに URL が付き（`/a/{slug}/{記事の名前}`）、配ったリンクは永久に解決し続けます。

他の 8 本は「あなたが書いたページに、あなたのデータを流し込む」形でした。これは
「フィールド名を 3 つ宣言すると、サイトが 1 つできる」形です。だから決めることが少なく、
**できないことが他より多い**——その境界がこのファイルの大半です。

書く人のための `views/desk.html` は 1 枚だけ書きます（投稿・書き直し・削除）。読む人のページは
書きません。

**先に読む節**: [下書きは作れません](#下書きは作れません)。この形を選ぶかどうかがそこで決まります。

## app.json

```json
{
  "name": "Field Notes",
  "slug": "field-notes",
  "protocol": "2.0.0",
  "members": {
    "editor@example.jp": { "*": "owner" },
    "kei@example.jp": { "articles": "editor" },
    "mika@example.jp": { "articles": "editor" }
  },
  "collections": {
    "articles": {
      "writerDelete": true
    }
  },
  "theme": { "hue": 200 },
  "views": [
    {
      "id": "public",
      "audience": "public",
      "type": "article",
      "collections": ["articles"],
      "article": { "title": "title", "summary": "summary", "body": "body" },
      "limit": { "articles": 16 }
    },
    {
      "id": "desk",
      "audience": "member",
      "path": "views/desk.html",
      "collections": ["articles"]
    }
  ],
  "public": {
    "enabled": true,
    "read": ["articles"],
    "submit": {
      "articles": {
        "auth": "verifiedEmail",
        "createFields": ["slug", "title", "summary", "body", "publishedAt"],
        "validate": { "required": ["title", "body"] },
        "idFrom": "slug",
        "idField": "slug",
        "stampField": "publishedAt",
        "maxBytes": { "title": 200, "summary": 800, "body": 60000 },
        "window": { "until": "2000-01-01T00:00:00Z" }
      }
    }
  }
}
```

### 鍵ごとの理由

**`"type": "article"` と `article`** — 公開ビューの中身。`path` は書きません（両方書くと publish が
断ります）。`title` / `body` は必須、`summary` は索引に出る 2 行で省略可。**対応づけられるのはこの
3 つだけです** —— 著者名もタグも日付以外の何も、描かれるページには出せません（[署名](#署名を出したいとき)）。

**`"protocol": "2.0.0"` — 他の 8 本と違うのはここだけです。** 記事ビューは、読み手が
**理解しないと正しく描けない**最初の鍵です。知らない reader は「HTML が無い＝ビューが無い」と
判断して、雑誌の場所に**自動生成のフォーム**を出します。何もエラーになりません。訪問者は別のアプリを
見せられます。だから major が上がり、**それを使うアプリだけ**が上がります。他のテンプレートを
コピーするときは `1.0.0` のままにしてください。

**`idFrom: "slug"` / `idField: "slug"`** — 送った `slug` がそのままドキュメント id になり、記事の
URL になります。文法は `^[a-z0-9][a-z0-9-]{0,63}$`（小文字・数字・ハイフン、先頭は英数字、64 文字まで）。
**重複は Firestore が断ります**——先に取った人が持ち主で、これが唯一の排他です。

**`stampField: "publishedAt"`** — 日付は**サーバの時計**が打ちます。送っても凍結されても書けません。
索引はこの順に並ぶので、日付を打てるなら並び順を打てることになる、というのがこの鍵の意味です。

**`window.until` を過去にして閉じる** — 閉じた窓は `publicCreate` を殺し、`createWith` に残るのは
**writer の枝だけ**になります。つまり「名簿の owner / editor だけが投稿できる」。参加者や通りすがりに
書かせたいときは [外から寄稿を受けたいとき](#外から寄稿を受けたいとき変種) を読んでください——
窓を開けるのは「名簿を開ける」ではなく「世界に開ける」です。

**`writerDelete: true`** — owner / editor がどの記事でも消せます。**これがこのアプリで唯一の
「取り下げ」です**（次節）。

**`theme.hue`** — プラットフォームが描くページに、このアプリの色を渡す唯一の手段。0–359 の整数 1 つで、
索引も記事ページもこの色相で組まれます。`views/desk.html` の `--hue` と揃えてください（別々に書く 2 つの
数字なので、揃えるのはあなたの仕事です）。

**`maxBytes`** — **ルールがまったく持たない唯一の上限**です。`firestore.rules` に `maxBytes` は
1 度も出てきません。`limit × 合計` が索引 1 回の代金で、それを宣言だけから計算できる場所が publish
しかないからで、実際に断るのはホストとページです。単位は **UTF-8 のバイト**（[バイト数](#バイト数と日本語)）。

## .claude/skills/articles/schema.json

```json
{
  "title": "Articles",
  "icon": "article",
  "primaryKey": "id",
  "storage": { "type": "firestore" },
  "fields": {
    "id": { "type": "string", "label": "ID", "primary": true, "required": true },
    "slug": { "type": "string", "label": "URL 名", "required": true },
    "title": { "type": "string", "label": "見出し", "required": true },
    "summary": { "type": "text", "label": "リード（索引に出る 2 行）" },
    "body": { "type": "markdown", "label": "本文", "required": true },
    "publishedAt": { "type": "datetime", "label": "公開日時" }
  }
}
```

`body` は `markdown`、`summary` は `text`、`publishedAt` は `datetime`。`stampField` に指定した欄は
`datetime` で宣言します——保存されるのはサーバの Timestamp で、ページには `…Z` の文字列で届きます
（辞書順が時刻順になるので、そのまま並べ替えに使えます）。

**`author` も `tags` も置いていません。** 描かれるページが読むのは title / summary / body の 3 つだけで、
残りは**保存されて誰にも表示されません**。世界に読めるコレクションは 1 行まるごと世界に読めるので、
「保存はされるが出ない欄」は、書いた人の知らないところに置かれた文字列です。要るときだけ足してください。

## views/desk.html — 書く人が使う 1 枚

```html
<style>
  * { box-sizing: border-box; }
  :root {
    --hue: 200;
    --main:  oklch(47% .09 var(--hue));
    --line:  oklch(47% .09 var(--hue) / .16);
    --muted: oklch(53% .02 var(--hue));
    --fill:  oklch(96% .018 var(--hue));
    --ink:   oklch(23% .015 var(--hue));
    --paper: oklch(99.4% .007 85);
  }
  html { min-height: 100%; color: var(--ink); color-scheme: light; background: var(--paper); background-image: linear-gradient(180deg, oklch(98.6% .01 var(--hue)) 0, oklch(96.4% .012 var(--hue)) 100%); background-attachment: fixed; }
  body {
    margin: 0;
    padding: clamp(16px, 3.5vw, 36px) clamp(14px, 3.5vw, 26px) 72px;
    font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
    line-height: 1.55;
  }
  .wrap { max-width: 820px; margin: 0 auto; display: grid; gap: 16px; }
  .panel {
    background: var(--paper); border: 1px solid var(--line);
    border-radius: 24px; padding: clamp(18px, 3.4vw, 28px);
    box-shadow: 0 18px 50px oklch(30% .05 var(--hue) / .08);
  }
  .eyebrow {
    font-size: 12px; font-weight: 800; letter-spacing: .16em;
    text-transform: uppercase; color: var(--main); margin: 0 0 8px;
  }
  h1 { margin: 0; font-size: clamp(22px, 4.4vw, 30px); line-height: 1.15; letter-spacing: -.03em; font-weight: 780; }
  h2 { margin: 0 0 14px; font-size: 17px; letter-spacing: -.015em; font-weight: 780; }
  .note { margin: 10px 0 0; color: var(--muted); font-size: 13.5px; }

  label { display: block; font-size: 12.5px; font-weight: 750; color: var(--muted); margin: 0 0 5px; }
  .field { margin: 0 0 14px; }
  input[type=text], textarea {
    width: 100%; background: #fff; color: var(--ink);
    border: 1px solid var(--line); border-radius: 12px;
    padding: 10px 12px; font: inherit; font-size: 15px;
  }
  textarea { resize: vertical; line-height: 1.55; }
  textarea.body { min-height: 220px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 13.5px; }
  input:focus, textarea:focus { outline: 2px solid var(--main); outline-offset: 1px; border-color: transparent; }

  .btn {
    background: var(--main); color: var(--paper);
    border: 0; border-radius: 12px; padding: 10px 18px;
    font: inherit; font-weight: 750; font-size: 14px;
    min-height: 38px; touch-action: manipulation; cursor: pointer;
  }
  .btn.ghost { background: var(--fill); color: var(--main); }
  .btn.danger { background: oklch(52% .16 25); color: oklch(99% .005 25); }
  .btn.small { padding: 6px 12px; font-size: 12.5px; min-height: 32px; }
  .btn:disabled { opacity: .5; cursor: default; }
  .btn:focus-visible { outline: 2px solid var(--ink); outline-offset: 2px; }
  .actions { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }

  .msg { margin: 12px 0 0; font-size: 13.5px; font-weight: 700; color: var(--main); }
  .msg.bad { color: oklch(48% .16 25); }

  .row {
    display: grid; grid-template-columns: 1fr auto; gap: 12px; align-items: start;
    border: 1px solid var(--line); border-radius: 14px;
    padding: 12px 14px; margin: 0 0 10px; background: var(--paper);
  }
  .row:last-child { margin-bottom: 0; }
  .row.editing { border-radius: 14px 14px 0 0; margin-bottom: 0; }
  .row .t { font-weight: 780; font-size: 15px; letter-spacing: -.01em; }
  .row .m { margin-top: 4px; font-size: 12.5px; color: var(--muted); }
  .row .side { display: flex; flex-wrap: wrap; gap: 6px; justify-content: flex-end; align-items: center; }
  .confirm { font-size: 12.5px; font-weight: 700; color: oklch(48% .16 25); margin-right: 4px; }

  .editor {
    border: 1px solid var(--line); border-top: 0;
    border-radius: 0 0 14px 14px; background: var(--fill);
    padding: 14px 14px 12px; margin: 0 0 10px;
  }
  .editor input[type=text], .editor textarea { background: var(--paper); }

  @media (max-width: 680px) {
    .row { grid-template-columns: 1fr; }
    .row .side { justify-content: flex-start; }
    .btn { width: 100%; }
    .btn.small { width: auto; }
  }
</style>

<div class="wrap">
  <div class="panel">
    <p class="eyebrow">Field Notes</p>
    <h1>編集デスク</h1>
    <p class="note">投稿した瞬間に <strong>/a/field-notes</strong> で世界に読まれます。下書きはありません。
      <strong>取り下げは削除だけ</strong>で、元に戻せません。</p>
    <p class="note">出したあとの記事は<strong>その場で書き直せます</strong>——見出し・リード・本文。
      <strong>URL 名と日付は変わりません</strong>：作られたときにルールが凍らせたので、一度解決した
      リンクは解決し続けます。名前を変えたい記事は、別の記事です。</p>
  </div>

  <div class="panel" id="compose">
    <h2>新しい記事</h2>
    <p class="note" id="composeNote">読み込み中…</p>
  </div>

  <div class="panel">
    <h2>記事</h2>
    <div id="list"><p class="note">読み込み中…</p></div>
  </div>
</div>

<script>
  (function () {
    var view = window.__MC_APP_VIEW;
    var compose = document.getElementById("compose");
    var composeNote = document.getElementById("composeNote");
    var list = document.getElementById("list");
    var latest = null;
    var built = false;
    var arming = {};    // id -> 削除の確認が出ている
    // 書き直し中の記事と、そこまでに打たれた内容。list は state が来るたび作り直されるので、
    // 中に持つと誰かが投稿した瞬間に打ちかけの文章が消える。
    var editing = null; // { id, values, saving, msg, bad }

    var el = function (tag, cls, text) {
      var n = document.createElement(tag);
      if (cls) n.className = cls;
      if (text != null) n.textContent = text;
      return n;
    };

    // `publishedAt` はサーバの Timestamp で、ページには 9 桁までの `…Z` 文字列で届く。生で出すと
    // ミリ秒以下が並ぶので、日付と時刻だけ取り出す。
    var when = function (v) {
      var m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/.exec(String(v || ""));
      if (!m) return "";
      return m[1] + "-" + m[2] + "-" + m[3] + (m[4] ? " " + m[4] + ":" + m[5] : "");
    };

    // 見出しから URL 名を作る。**日本語は 1 文字も残りません**（文法が英数字とハイフンだけなので）。
    // 空になったら書き手に決めてもらう。ここで断るのは、ルールがこれを欄の名前を言わない
    // permission エラーで返すから: `slugOk` はドキュメント id の文法で、どのフィールドの話かを
    // 言う手段がない。
    var slugify = function (text) {
      return String(text || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 64).replace(/-+$/, "");
    };

    var capOf = function () {
      return (latest && latest.viewer && latest.viewer.can && latest.viewer.can.articles) || {};
    };
    var rows = function () {
      return ((latest && latest.data && latest.data.articles) || []).slice().sort(function (a, b) {
        return String(b.publishedAt || "").localeCompare(String(a.publishedAt || ""));
      });
    };

    // 欄の呼び名を 1 か所に。投稿フォーム・書き直しフォーム・上限超過の文言が同じ欄を指すのに
    // 違う名前で呼ぶと、書き手は自分の画面でその欄を探せない。
    var LABELS = { title: "見出し", slug: "URL 名", summary: "リード", body: "本文" };
    var labelOf = function (key) {
      return Object.prototype.hasOwnProperty.call(LABELS, key) ? LABELS[key] : key;
    };

    // ルールが持たない唯一の上限。親も断る（`too-long`）が、ここで言うと**欄と数字を名指せる**。
    // 超えた欄を全部返す（1 つずつだと長い欄の数だけ往復する）。`hasOwnProperty` を通すのは、
    // 欄の名前が宣言から来る文字列で `constructor` も正当な名前だから——素の添字は関数を返す。
    var overLong = function (values) {
      var caps = capOf().maxBytes || {};
      var over = [];
      Object.keys(values).forEach(function (key) {
        if (!Object.prototype.hasOwnProperty.call(caps, key)) return;
        var cap = caps[key];
        if (typeof cap !== "number") return;
        var bytes = new TextEncoder().encode(String(values[key])).length;
        if (bytes > cap) over.push(labelOf(key) + " が " + bytes + " バイトで、上限 " + cap + " を超えています");
      });
      return over;
    };
    var overLongMessage = function (over) {
      return over.join("。") + "。文字数ではなく UTF-8 のバイト数で、かなと漢字は 1 文字 3 バイトです。何も送っていません。";
    };

    // 書ける人か。「作ってよい」という capability は無く、窓を閉じてあるので `publicCreate` は
    // 立たない——作れる＝writer の枝、なので role をそのまま訊く。`correctAny` が role そのもの。
    // `withdrawAny` は古いランタイム用の予備で、そちらは `writerDelete` の宣言にも依存する。
    var mayWrite = function () {
      var can = capOf();
      return can.correctAny === true || can.withdrawAny === true;
    };

    // ---- 新しい記事（1 度だけ組み立てる。作り直すと打ちかけが消える） ----
    var buildCompose = function () {
      compose.replaceChildren();
      compose.appendChild(el("h2", null, "新しい記事"));

      var mk = function (labelText, node) {
        var f = el("div", "field");
        f.appendChild(el("label", null, labelText));
        f.appendChild(node);
        return f;
      };
      var input = function (ph) {
        var n = document.createElement("input");
        n.type = "text";
        n.placeholder = ph || "";
        return n;
      };

      var title = input("なぜ端末が勝ったのか");
      var summary = document.createElement("textarea");
      summary.rows = 2;
      var body = document.createElement("textarea");
      body.className = "body";
      body.placeholder = "*文 · 中島聡*\n\n本文は Markdown。見出し、**強調**、`コード`、引用、箇条書き、\n[リンク](https://example.com) が使えます。画像は置けません。";

      var slug = document.createElement("input");
      slug.type = "text";
      slug.placeholder = "why-terminals-won";
      // 書き手が触るまでは見出しから作り、触ったら二度と上書きしない。
      var slugTouched = false;
      slug.oninput = function () { slugTouched = true; };
      title.oninput = function () { if (!slugTouched) slug.value = slugify(title.value); };

      compose.appendChild(mk("見出し", title));
      compose.appendChild(mk("URL 名 — /a/field-notes/<名前> になり、あとから変えられません", slug));
      compose.appendChild(mk("リード — 索引に出る 2 行", summary));
      compose.appendChild(mk("本文（Markdown）— 署名を出したいときは 1 行目に書きます", body));

      var actions = el("div", "actions");
      var post = el("button", "btn", "公開する");
      post.type = "button";
      actions.appendChild(post);
      compose.appendChild(actions);

      var msg = el("p", "msg");
      compose.appendChild(msg);
      var say = function (text, bad) {
        msg.textContent = text || "";
        msg.className = bad ? "msg bad" : "msg";
      };

      post.onclick = function () {
        if (!(title.value || "").trim()) { say("見出しが要ります。", true); return; }
        if (!(body.value || "").trim()) { say("本文がありません。", true); return; }
        var name = slugify(slug.value || title.value);
        if (!name) { say("URL 名を決めてください（小文字・数字・ハイフン）。日本語の見出しからは作れません。", true); return; }

        var written = {
          slug: name,
          title: title.value.trim(),
          summary: (summary.value || "").trim(),
          body: body.value
          // `publishedAt` は送りません。ルールがサーバの時計に固定して以後凍らせるので、
          // ここから送った値は拒否されます。それが `stampField` の意味です。
        };
        var over = overLong(written);
        if (over.length > 0) { say(overLongMessage(over), true); return; }

        post.disabled = true;
        say("");
        view.submit("articles", written).then(function (res) {
          post.disabled = false;
          if (res && res.ok) {
            say("公開しました。/a/field-notes/" + name + " で読めます。");
            title.value = ""; summary.value = ""; body.value = ""; slug.value = "";
            slugTouched = false;
            return;
          }
          if (res && res.error === "cancelled") { say(""); return; }
          say("公開できませんでした: " + ((res && res.error) || "unknown"), true);
        });
      };
    };

    var renderCompose = function () {
      if (!mayWrite()) {
        compose.replaceChildren();
        compose.appendChild(el("h2", null, "新しい記事"));
        compose.appendChild(el("p", "note", "書けるのは owner と editor だけです。名簿を変えたあと publish していないと、ここはこう出ます。"));
        built = false;
        return;
      }
      if (built) return;
      buildCompose();
      built = true;
    };

    // ---- 出したあとの書き直し ----
    var EDITABLE = [
      { key: "title", label: "見出し", kind: "text" },
      { key: "summary", label: "リード", kind: "area" },
      { key: "body", label: "本文（Markdown）", kind: "body" }
    ];

    // 誰が何を書き直せるか。訊くのは capability で、audience ではありません。
    // `can.frozen` は**誰であれ**書けない欄（ルールが作成時に凍らせたもの＋他の ask が持つ欄）。
    // 先に引くので、role が届く場合でも凍った欄は描かれません。
    // `correctAny` は role（どの記事のどの欄でも）、`correctFrom` は自分が出した記事を、その状態で。
    var editableFields = function (can, status) {
      var frozen = can.frozen || [];
      var reachable = EDITABLE.filter(function (f) { return frozen.indexOf(f.key) === -1; });
      if (can.correctAny === true) return reachable;
      var byStatus = can.correctFrom || {};
      var allowed = Object.prototype.hasOwnProperty.call(byStatus, status) ? byStatus[status] || [] : [];
      return reachable.filter(function (f) { return allowed.indexOf(f.key) !== -1; });
    };

    var buildEditor = function (record, fields) {
      var box = el("div", "editor");
      fields.forEach(function (f) {
        var wrap = el("div", "field");
        wrap.appendChild(el("label", null, f.label));
        var node;
        if (f.kind === "text") {
          node = document.createElement("input");
          node.type = "text";
        } else {
          node = document.createElement("textarea");
          if (f.kind === "body") node.className = "body";
          else node.rows = 2;
        }
        node.value = editing.values[f.key] != null ? editing.values[f.key] : String(record[f.key] || "");
        // 打つたびに控えるので、途中で state が届いても打ちかけの文章のまま組み直される。
        node.oninput = function () { editing.values[f.key] = node.value; };
        node.disabled = editing.saving === true;
        wrap.appendChild(node);
        box.appendChild(wrap);
      });

      var actions = el("div", "actions");
      var save = el("button", "btn small", editing.saving ? "保存中…" : "保存する");
      save.type = "button";
      save.disabled = editing.saving === true;
      var cancel = el("button", "btn ghost small", "やめる");
      cancel.type = "button";
      cancel.disabled = editing.saving === true;
      actions.appendChild(save);
      actions.appendChild(cancel);
      box.appendChild(actions);
      if (editing.msg) box.appendChild(el("p", editing.bad ? "msg bad" : "msg", editing.msg));

      cancel.onclick = function () { editing = null; renderList(); };

      save.onclick = function () {
        // 変わった欄だけ。全部送ると誰も触っていない欄まで書き直し、直前に他の人が直した欄が
        // あれば古い値に戻してしまう。
        var changed = {};
        var any = false;
        fields.forEach(function (f) {
          var was = String(record[f.key] || "");
          var now = editing.values[f.key] != null ? editing.values[f.key] : was;
          if (now !== was) { changed[f.key] = now; any = true; }
        });
        if (!any) { editing.msg = "変わっていません。"; editing.bad = false; renderList(); return; }

        var over = overLong(changed);
        if (over.length > 0) { editing.msg = overLongMessage(over); editing.bad = true; renderList(); return; }

        editing.saving = true;
        editing.msg = "";
        renderList();
        view.correct("articles", record.id, changed).then(function (res) {
          if (res && res.ok) { editing = null; renderList(); return; }
          editing.saving = false;
          if (res && res.error === "cancelled") { editing.msg = ""; renderList(); return; }
          editing.msg = "保存できませんでした: " + ((res && res.error) || "unknown") + "。何も書いていません。";
          editing.bad = true;
          renderList();
        });
      };
      return box;
    };

    // ---- 一覧 ----
    var renderList = function () {
      var can = capOf();
      var all = rows();
      list.replaceChildren();

      // 書き直していた記事が消えていることがある（他の人が削除した）。指す先を失ったまま
      // 「保存する」を押せないように落とす。
      if (editing !== null && !all.some(function (r) { return r.id === editing.id; })) editing = null;

      if (!all.length) {
        list.appendChild(el("p", "note", "まだ 1 本もありません。"));
        return;
      }

      all.forEach(function (r) {
        var row = el("div", "row");
        var main = el("div");
        main.appendChild(el("div", "t", r.title || r.id));
        var bits = [];
        if (r.publishedAt) bits.push(when(r.publishedAt));
        bits.push(r.id);
        main.appendChild(el("div", "m", bits.join("  ·  ")));
        row.appendChild(main);

        var side = el("div", "side");
        var fields = editableFields(can, r.status);
        var open = editing !== null && editing.id === r.id;

        if (fields.length > 0) {
          var edit = el("button", "btn ghost small", open ? "閉じる" : "書き直す");
          edit.type = "button";
          edit.onclick = function () {
            // 1 本ずつ。2 つ開くと打ちかけが 2 本になり、どちらの「保存する」か分からなくなる。
            editing = open ? null : { id: r.id, values: {}, saving: false, msg: "", bad: false };
            renderList();
          };
          side.appendChild(edit);
        }

        if (can.withdrawAny === true) {
          if (arming[r.id]) {
            side.appendChild(el("span", "confirm", "本当に消しますか？"));
            var yes = el("button", "btn danger small", "消す");
            yes.type = "button";
            yes.onclick = function () {
              yes.disabled = true;
              view.withdraw("articles", r.id).then(function (res) {
                delete arming[r.id];
                if (!res || !res.ok) {
                  yes.disabled = false;
                  if (res && res.error === "cancelled") { renderList(); return; }
                  main.appendChild(el("div", "m", "消せませんでした: " + ((res && res.error) || "unknown")));
                  return;
                }
                renderList();
              });
            };
            var no = el("button", "btn ghost small", "やめる");
            no.type = "button";
            no.onclick = function () { delete arming[r.id]; renderList(); };
            side.appendChild(yes);
            side.appendChild(no);
          } else {
            var del = el("button", "btn ghost small", "消す");
            del.type = "button";
            del.onclick = function () { arming[r.id] = true; renderList(); };
            side.appendChild(del);
          }
        }

        row.appendChild(side);
        if (open) row.className = "row editing";
        list.appendChild(row);
        if (open) list.appendChild(buildEditor(r, fields));
      });
    };

    if (!view) {
      composeNote.textContent = "このページはホストの中でしか動きません。/m/field-notes で開いてください。";
      return;
    }

    view.onState(function (data, viewer) {
      latest = { data: data || {}, viewer: viewer || {} };
      renderCompose();
      renderList();
    });
    // `onState` の**外**で呼びます。中で呼ぶと永久に呼ばれません——親は ready が来るまで
    // 何も送らないので、コールバックが動く機会が来ない。
    view.ready();
  })();
</script>
```

## 下書きは作れません

これが最初に決まることです。

`public.read` はコレクションを開けます。**1 行ずつ**開けます——ルールに「この行は読ませない」と
書く方法はありません（射影も行を絞れません。見せる／見せないの境界はドキュメントであって
フィールドではない）。だから:

**レコードを作ること＝公開すること。** 途中の原稿を「まだ出さない状態」で置いておく場所は、
このアプリの中にありません。

**やり方はこうです**: 書きかけはリポジトリの中（`drafts/*.md`）に置き、書き上がったら投稿します。
テキストは手元にあり、公開されるのは 1 回だけ。**これは制限であって回避策ではありません**——
「下書きコレクションを作って完成したら移す」も同じ理由で意味がありません（下書きコレクションを
`public.read` に入れなければ読めますが、それは「下書きが公開されない」ではなく
「下書きが**あなた以外の書き手にも**見えない」だけです。移すのも人手です）。

## 状態は何も隠しません

`status` という欄を足して `draft` / `published` にしたくなります。**効きません。**

公開側で status を読むものは 1 つもありません。索引を描くコンポーネントは
「他の公開ビューと同じデータセットを描く」だけで、射影が status に触るのは**投稿フォームから
その欄を外す**ためだけです。つまり `status: "draft"` の行は、`published` の行と同じように
索引に出て、同じ URL で読まれます。

だから**このテンプレートは `statusField` を宣言していません**。状態を足すのは、
それが「見え方」ではなく**編集上の印**であるときだけにしてください（「デスクが確認済み」など）。
そのときはボタンにも `Archive` ではなく `確認済みにする` のように、**何が起きるか**を書きます——
公開索引の隣の「アーカイブ」は「一覧から下げる」に読めますが、下げられません。

**取り下げは削除だけです。** 消えたら戻りません。それが `writerDelete` を宣言している理由です。

## `putItems` ではこのコレクションに書けません

`manageCollection` の `putItems` は、`stampField` と `idFrom` を持つコレクションに
**どんなレコードでも・どんな role でも**書けません。`createWith` の `stampOk` と `fieldIdOk` は
**連言**で、role の選言より**手前**にあります。`putItems` の経路にはサーバのタイムスタンプが無く、
id は `primaryKey` から取るので、両方落ちます。

返るのは `PERMISSION_DENIED` だけです。**どの連言が落ちたかは誰も言えません。**

満たせるのは `useSharedApp` の `submit` だけ。ここに実際にはまると、切り分けが
「昨日は動いていた」から始まります——2 つの鍵を入れる前は、両方の連言が空振りしていて通っていたからです。

書き直しは別で、**`putItems` の `mode: "merge"` でも通ります**（`stampOk` / `fieldIdOk` は
作成時だけ。更新に掛かるのは「動かしていないこと」）。ただし `slug` と `publishedAt` に触らないこと。

## `slug` は凍ります

作成後、`idHeld` が `slug` を凍らせます。**id は URL で、id は欄について行けません**——
改名すると、配ったリンクは「自分は別の名前だ」と書いてあるドキュメントを指し続けます。
名前を変えたい記事は、新しい記事として出し直してください（正直な方法です）。

`publishedAt` も同じ理由で凍ります（`stampHeld`）。順序を打てないのが、この鍵の存在意義です。

## バイト数と、日本語

`maxBytes` は **UTF-8 のバイト**で、文字数ではありません。**かなと漢字は 1 文字 3 バイト**なので、
`title: 200` は日本語なら約 66 文字です。文字数で数えると 3 倍近く通してしまいます。

上のページは送る前に自分で測って、**欄の名前と実バイト数と上限**を出します。これは親も断りますが、
親の答えは欄を名指しません。**ルールはこの上限を持っていません**ので、ページとホストが
測らなければ誰も測りません。

## 索引に出るのは新しい順に N 件

`limit.articles` の件数です。**その次の記事は、URL は生きたまま一覧から消えます。**
「前の記事へ」はプラットフォームが描くページには**ありません**。

つまり `limit` は「何本まで書けるか」ではなく「索引が何本見せるか」です。長く続ける雑誌なら、
一覧から落ちた記事に人が辿り着く道を別に用意してください（本文の中からリンクする、
目次の記事を 1 本立てる、など——どれも記事として書けます）。

**この数字は publish が計算して断ります。** 代金は `limit ×（描かれる欄の maxBytes の合計）`で、
それが索引を 1 回開く転送量です。上の宣言は

    16 ×（title 200 + summary 800 + body 60000）= 976,000 バイト

で、上限 1,000,000 にぎりぎり収まっています。`limit` を 20 にすると 1,220,000 になり、
**publish が断ります**。しかも publish はこう言い添えます——「少なくとも、であって、ちょうど、ではない」。
ルールはフィールドを射影で落とせないので、索引は **1 行まるごと**落としてきます（`slug` も
`publishedAt` も数に入っていません）。安い索引が要るなら、見出しとリードだけを持つ**別のコレクション**を
作るしかありません。

## 署名を出したいとき

`article` が対応づけるのは **title / summary / body の 3 つだけ**です。著者名の欄を足しても、
描かれるページはそれを読みません。

**本文の 1 行目に書いてください。**

```
*文 · 中島聡*

## 見出し

……
```

保存されるだけで表示されない欄を足すより正直です——世界に読めるコレクションは 1 行まるごと
世界に読めるので、「出ない欄」は書いた人の知らないところに置かれた文字列になります。

## 外から寄稿を受けたいとき（変種）

上の宣言は**窓を閉じてある**ので、書けるのは名簿の owner / editor だけです。名簿に足せば書き手が
増えます——それが普通の答えです。

名簿に**載っていない**人からも受けたいときは、窓を開けます。そのとき変わることが 4 つあります。

1. **`window` を消す**（または未来まで開ける）。`publicCreate` が立ちます。
2. **開くのは「名簿」ではなく「世界」です。** `auth: "verifiedEmail"` は「メールが検証済みの
   サインイン済みの誰か」であって、あなたが招いた人ではありません。**Google アカウントを持つ
   全員が、あなたのサイトに記事を出せます。**
3. **`emailField` を足します**（例 `"byEmail"`）。ルールがそこに書き手のアドレスを入れ、
   `ownRow` がそれを見て「自分の記事」を判定します。これが無いと、寄稿者は自分の記事すら直せません。
4. **そのアドレスは公開されます。** 世界に読めるコレクションは 1 行まるごと世界に読めるので、
   `byEmail` は記事と一緒に誰にでも読まれます。避けたいなら `uidField` を使ってください
   （不透明な id で、人には読めません。ただし人に見せる名前にも使えません）。

そのうえで `statusField` と `selfUpdate` を足すと、「寄稿者は自分の記事を、デスクが確認する前まで
直せる」が書けます:

```json
"collections": {
  "articles": {
    "statusField": "status",
    "transitions": { "initial": ["fresh"], "fresh": ["checked"], "checked": ["fresh"] },
    "writerDelete": true
  }
},
"public": {
  "submit": {
    "articles": {
      "emailField": "byEmail",
      "initialStatus": "fresh",
      "selfUpdate": { "fresh": ["title", "summary", "body"] },
      "selfDelete": ["fresh"]
    }
  }
}
```

`selfUpdate` は**状態ごと**に宣言します——ルールは行の現在の状態を読んでから欄のリストを見るので、
`checked` になった記事はデスクしか直せなくなります。上のページはこれをそのまま描きます
（`correctFrom` を読む枝が、そのとき初めて効きます）。

**`status` は相変わらず何も隠しません。** `fresh` の記事も `checked` の記事も、同じように公開されています。

## 落とし穴

- **`type` と `path` を両方書く** — publish が断ります。描かれるページか、自分で書くページか、どちらか。
- **`protocol` を `1.0.0` のままにする** — 記事ビューを持つアプリだけが `2.0.0` です。他のテンプレートから
  コピーしたときに残りがち。
- **`limit` を宣言して `stampField` を宣言しない** — `limit` は射影に出ません（並べる欄が無いので）。
  黙って全件になります。
- **日本語の見出しから URL 名を作ろうとする** — 文法は英数字とハイフンだけなので、空になります。
  ページが先に断らないと、ルールは欄を名指さない permission エラーを返します。
- **`theme.hue` とページの `--hue` がずれる** — 別々に書く 2 つの数字です。描かれるページと
  デスクが違う色になります。
- **プレビューで押さずに publish する** — 記事は取り消せません。ペインで一度押してください。

## 作る順番

1. `mulmoterminal-shared-app` の `init` で `aid` を採ってもらう。
2. `.claude/skills/articles/schema.json` を置く。
3. `app.json` を上の形で書く。`slug`・`name`・`members`・`theme.hue` を自分のものに。
4. `views/desk.html` を置く。`--hue` を `theme.hue` と揃え、見出しの文言を自分のものに。
5. `check` → ペインで desk を開き、**実際に 1 本投稿して、書き直して、消す**。
6. `publish`。`/a/{slug}` が索引、`/a/{slug}/{記事名}` が記事、`/m/{slug}` がデスク。
