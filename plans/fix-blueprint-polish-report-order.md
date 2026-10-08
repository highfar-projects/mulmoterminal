# polish's report puts the writer's questions right after what was polished (#2788)

polish's report ran 整えたもの → 確かめたこと → 直さずに残したもの → 書いた人に確かめてほしいこと, so the part the person
has to act on came last, below the fold of the report pane on the finished screen. The report skill now places
`## 書いた人に確かめてほしいこと` right after `## 整えたもの`. The report check looks only for the sections, not their
order, so the skill is the whole change.

A real build of the manual sample wrote the sections in the new order.
