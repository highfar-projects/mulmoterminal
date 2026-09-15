# A quoted PATH entry survives `sanitizePtyEnv` and is then searched

`sanitizePtyEnv` removes the PATH entries a run script injects — `node_modules/.bin`, npm's
`node-gyp-bin`, yarn v1's shim dir — so a PTY does not inherit tooling the user never installed.

**A Windows PATH entry may be written with quotes**, and `windowsSearchDirectories`
(`server/infra/resolve-bin.ts`) strips the pair before looking inside. `isLauncherPathEntry` compared
the QUOTED spelling, so the entry survived the sanitiser and the search then dequoted and used it.

## Reproduced before anything was designed

Against `4335ea1a`, through the real functions:

```
isLauncherPathEntry("C:\p\node_modules\.bin")     true    ← removed
isLauncherPathEntry("\"C:\p\node_modules\.bin\"")  false   ← kept
PATH handed to the spawn:   "C:\p\node_modules\.bin";C:\Windows
directories it will search: ["C:\p\node_modules\.bin", "C:\Windows"]
```

The directory the function exists to remove reaches the spawn, kept by its punctuation.

## The fix follows the SEARCH, which is why it is platform-conditional

Dequoting is what Windows does. On POSIX nothing dequotes and a directory may legally BE named with
quotes, so stripping them there would drop a PATH entry the search would have used — a second bug in
place of the first. `isLauncherPathEntry` takes a platform (defaulting to `process.platform`) and
dequotes only on `win32`; `sanitizePathEntries` and `sanitizePtyEnv` pass it through.

The parameter is also what makes the gap testable. It hid because quoting is a Windows idea and every
test ran on POSIX, where the answer is the same either way — so the specs name both platforms
explicitly rather than inheriting the runner's.

## Verified

Per platform, through `sanitizePtyEnv` itself:

| | `isLauncherPathEntry` | PATH handed to the spawn |
|---|---|---|
| win32 | true | `C:\Windows` |
| linux | false | `"C:\p\node_modules\.bin";C:\Windows` |

Break-verified, each mutation asserted to have applied: not dequoting at all (main's behaviour)
reddens 2, dequoting on POSIX too reddens 2, not passing the platform through reddens 2, and
stripping a single leading-or-trailing quote instead of a matched pair reddens 2.

## Where this came from

Found by Codex during the cross-review of #2085, in a file that PR was not otherwise about. #2085 is
closed as superseded by #2084, which answered #2082's design question the other way; this defect is
independent of that decision and is live on main, so it travels on its own.

Deliberately NOT carried over from #2085: an `inheritedPtyEnv` extraction with property coverage. It
is a refactor, and a salvage PR is better boring.
