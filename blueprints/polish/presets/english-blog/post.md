# Speeding Up Our CI by Caching Dependencies

In today's fast-paced world of software development, speed is more important than ever, and every team is looking for ways to ship faster.

## The problem

Our pull request checks took about 14 minutes. Almost 6 of those minutes went to installing the same dependencies on every run, even when the lockfile had not changed at all since the previous run on the same branch, which meant that most of that time was simply wasted work that the runner repeated again and again.

## What we changed

We added a cache step keyed on the hash of the lockfile. When the lockfile is unchanged, the runner restores the installed packages from the cache instead of downloading them.

## The result

The install step now takes about 40 seconds when the cache is warm, and the whole check finishes in about 9 minutes.

## Conclusion

In conclusion, caching is a powerful technique that can dramatically improve your workflow. I hope this was helpful!
