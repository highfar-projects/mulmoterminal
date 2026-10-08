# After aligning terms, offer polishing the same documents (#2764)

glossary writes the spellings to use into the folder's chaff.yaml (`prefer`, with `preferred-term` turned on) and
changes no document. Correcting the documents is the next job, and the finished screen offered nothing for it.

- glossary's manifest gains a next step: polish, carrying `documents` into `targets`, with 「このフォルダの規約」 and
  「chaff が指摘した所だけ」.
- Where the person chose not to write chaff.yaml, #2744's rule leaves 「このフォルダの規約」 unoffered, so the form
  drops it and polish runs with chaff's defaults. Where the folder has no STYLE.md, the scope question is settled.
- `preferred-term` is experimental and polish runs no experimental rule by flag; it runs here because chaff.yaml
  turns it on, and polish runs chaff from the folder.

A real run: the glossary example finished, its next-step button opened the form filled in, and polish changed
サーバ → サーバー and ユーザ名 → ユーザー名 in the guide, with no avoided spelling left. The guide's glossary row says so.
