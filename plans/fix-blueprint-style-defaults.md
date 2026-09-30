# style starts with the obvious answers for language and strictness (#2770)

The style interview's 「言語」 and 「どれくらい厳しくしますか」 were required with no default, so every start had to pick
both though most people want the same answers. They now default to 「手本から自動で判定する」 and
「手本に合わせる（手本が通る範囲で）」. The questions stay, so anyone who wants another answer picks it.

`kind` stays as four coarse groups: the rules step picks the exact chaff genre from `chaff genres` (0.16's legal/*
and docs/* included), so the group only steers that choice.

Checked: the form shows both answers chosen when style is picked; a default that is not an option fails to load
the pack (`has a default it would refuse`).
