# fix: the new-build form offers only the bases the chosen task can use (#2734)

The form asked for the base first and always listed every base, so a document task (「文書を整える」) was offered
Cloudflare, Firebase, a local app, an existing repository and Supabase, none of which it can run on. Every document
task is built on 「文書のフォルダ」 alone; so are the refactor task (on 既存のリポジトリ) and the internal-app task
(on Firebase). Only the app tasks (「自由に作る」, 「コレクションからアプリにする」) have a base to choose.

## Change

- The task is chosen first, from every task, grouped by where it runs (`usecaseGroups`): the tasks built on one base
  alone under that base's name, in the bases' order, and the tasks that can be built on several second, under
  「アプリ（次に土台を選ぶ）」.
- The base selector appears only when the chosen task can be built on more than one installed base, and lists only
  those (`basesFor`).
- Each follows the other only when the pair would not fit: choosing a task whose bases do not include the current one
  moves the base to its first; a task that still fits keeps the base the person chose. An example, a finished build's
  next step and a kept form set both at once, as before. What is sent to the server (`base`, `usecase`) is unchanged.
- The message for no task at all no longer speaks of "this base". The guide says a document task asks no base.

Choices in an interview that cannot work in the folder (「このフォルダの規約」 with no `chaff.yaml`) are #2735.
