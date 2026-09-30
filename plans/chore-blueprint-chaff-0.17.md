# chaffjs 0.17 (#2790)

The document blueprints' pin moves from chaffjs 0.16 to 0.17: `checks/chaff.sh`, the workspace skill, the style
report skill, adopt's workflow template (and the spec that pins its text), and the genre list's comment.

- 0.17 turns the structure rules (numbering gaps, references to articles that do not exist, terms defined twice) on
  for `legal/statute`, as for `legal/contract` (isamu/lab#340). A regulation polished as 「規程・社内規則」 now gets
  them without `--experimental`; checked on a sample with a missing article and a dangling reference.
- The genre list is unchanged, so `polishKind.spec`'s list and polish's kinds need no change.
- isamu/lab#345 (`{preferred}` in preferred-term's fix line) is not in 0.17 yet; commented there. Nothing here
  depends on it.

On 0.17 the regulation example still reports only its one planted finding, and a real build of it gave the same
result as on 0.16.
