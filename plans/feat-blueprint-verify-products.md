# verify checks unit price × quantity and tax (#2762)

verify only checked that a total is the sum of its parts. An estimate's commonest mistakes — a line that is not its
unit price times its quantity, a tax that is not its rate of the subtotal — went unchecked, and #2761's real build
listed them under 「確かめきれなかったこと」.

- facts.json gains `products`: an amount the document claims is the product of others, `of` naming two or more
  amount ids. An amount whose unit is `%` is multiplied as a hundredth.
- New rule `product-mismatch` (`rules.mjs`, pure): the written value must be the product rounded to the digits it is
  written to, in either direction — tax on 12,345円 at 10% may be 1,234円 or 1,235円, and companies differ. The
  digits are the extracted number's own, so $37.00 read as 37 counts as whole dollars: lenient, never stricter.
  `detail` says which way and by how much, as `total-mismatch` does.
- The shape check refuses a product with fewer than two factors or a factor that is not an amount; its value must be
  in its quotation like any amount. facts.txt shows `label value = factor × factor`.
- The extract and report skills explain products; the report names a product the document gives no factor for as
  not checked.
- The estimate example's monitor line now has a unit price (24,800円) that does not make its amount (120,000円), so
  the example shows all three kinds of mistake. Its subtotal is still the sum of the written lines.

A real build from the example found the weekday, the grand total and the monitor line, and did not flag the tax
(81,000円 = 810,000円 × 10%).
