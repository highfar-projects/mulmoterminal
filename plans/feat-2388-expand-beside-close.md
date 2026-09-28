# feat: expand / restore beside close (#2388)

Part of #2311. `CellChromeButtons` renders expand / restore after set aside, immediately before
close, instead of first. Nothing at runtime selects "the first header button" (checked with grep);
only specs pinned the order. The old "keeps expand/restore first" spec passed through Vue Test
Utils' ordering (a child component's buttons are listed last) rather than the DOM, so it is replaced
by a DOM-order check that expand/restore sits immediately before close. Filmstrip thumbnails
(closeOnly) and the collection pane's hideExpand are unchanged.
