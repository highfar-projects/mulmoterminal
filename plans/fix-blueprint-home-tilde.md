# Blueprints: accept ~ in the project folder, as the guide writes it

Issue: #2403 (found in the post-merge review of #2400)

## Why

The guide, as changed by #2400, tells the person to type `~/blueprint-trials/library` into **Project folder**. The create route takes only an absolute path, so that exact input was refused as "not a full path". Reproduced against a running server.

## Shape

- `expandHome` (pure, `server/blueprint/newFolder.ts`) reads a leading `~` as the home folder: `~` alone, or `~` then a separator (`/`, and `\` where that is the separator). `~name` and a `~` anywhere else are left alone, and so still refused as relative.
- The create route expands before every other check, so trust, the folder plan and the build record all see the full path. The home is injected as a route dependency, and wiring passes `os.homedir()`.
- The guide keeps its example. It says what `~` means and gives the Windows forms.

## Verification

- `expandHome` in both directions: what expands, per separator, and what is left alone.
- Over HTTP: `~/from-home` makes and records the full path under the home.
- Each decision inverted in turn goes red.
