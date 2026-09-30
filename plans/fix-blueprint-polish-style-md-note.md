# polish does not report a missing STYLE.md when only chaff.yaml is needed (#2776)

Since #2744 「このフォルダの規約（STYLE.md と chaff.yaml）」 is offered with chaff.yaml alone; STYLE.md is read only when
`scope` asks to follow the guide. After glossary (chaff.yaml only), polish's report said STYLE.md was missing, as if
something had gone wrong (#2765's real run).

The option's value is not renamed: write → polish carries it as it is (`carry: { style: style }`), and the same
string is the answer in style's and glossary's next steps. Instead the survey and report skills say the folder's
style is its chaff.yaml, that a folder without STYLE.md lacks nothing unless `scope` asked for the guide, and that
the report does not mention it.

The survey line alone was not enough — the first real run still wrote it in the report — so the report skill says it
too. The second real run (a folder with chaff.yaml and no STYLE.md) corrected the spellings and did not mention
STYLE.md.
