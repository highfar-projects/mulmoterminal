# The originals comparison follows the app's theme (#2796)

#2793's comparison used oneDark, as the Files pane editor does, so it was a dark box on a light theme. It now takes
its background and text from the app's own theme variables (`--bg-base`, `--text`, the fold from `--bg-subtle` /
`--text-secondary`), so a custom theme matches too, and tells CodeMirror whether the theme is dark
(`isLightTheme(activeThemeVars)`), which picks the merge view's red and green for that background. Switching the
theme rebuilds the views.

Checked on the real screen with daylight and midnight. `activeThemeVars` is null under jsdom (the theme colours come
from CSS), so the component spec stands in a reactive theme to switch between light and dark.
