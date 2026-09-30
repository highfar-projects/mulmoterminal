# A review example for terms of service (#2766)

review's only example was a contract answered 「直し方の案まで作る」. This adds a self-written online shop's terms of
service, the kind 「規程・約款・利用規約」, answered 「指摘だけ」.

`presets/riyo-kiyaku/kiyaku.md` has three planted problems: 第8条 refers to a 第12条 that does not exist, 「会員」 is
defined twice across the whole terms (個人 in 第2条, 個人および法人 in 第6条), and returns are allowed for 7 days
(第5条) while refunds are promised for returns within 14 (第9条). An article-scoped definition 「この条において」 is
not a duplicate in legal drafting, and chaff rightly does not report one, so the second definition covers the terms.

A real build from the example found all three with quotations — the first two also as chaff's structure results —
plus four findings of the reviewer's own (when the 7 days count to, the refund's scope, defective goods, payment
methods), and made no proposal file.
