#!/bin/sh
# The app builds, and what the build produced follows the design the build chose (design.mjs reads the built CSS).
set -eu
# Whole seconds, rounded down, so a stylesheet written in the starting second still counts as this build's.
DESIGN_BUILD_STARTED_MS=$(($(date +%s) * 1000))
export DESIGN_BUILD_STARTED_MS
yarn build
node --no-warnings "$(dirname "$0")/design.mjs"
