# chaffjs 0.18 (#2805)

The document blueprints' pin moves from chaffjs 0.17 to 0.18 in `checks/chaff.sh`, the workspace skill, the style
report skill, adopt's workflow template (and the spec that pins its text), and the genre list's comment.

Compared with 0.17:
- the genre list is unchanged;
- preferred-term's fix line now names the spelling to use (isamu/lab#345), which the glossary → polish flow shows;
- every example document gives the same findings, except that glossary's sample, run with `--experimental`, now
  also gets the new experimental `katakana-long-vowel` (サーバ / サーバー mixed). polish and glossary run without
  `--experimental`, and review's check reads only the structure rules, so no check sees it.

A real glossary build on 0.18 wrote the same chaff.yaml as before, and chaff then reads 「→ 「サーバー」に直してください」.
