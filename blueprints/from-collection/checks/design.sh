#!/bin/sh
# The screens follow the design the build chose (design.mjs), and the app still builds with it.
set -eu
node --no-warnings "$(dirname "$0")/design.mjs"
yarn build
