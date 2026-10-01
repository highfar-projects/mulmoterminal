#!/bin/sh
# The app builds, and what the build produced follows the design the build chose (design.mjs reads the built CSS).
set -eu
yarn build
node --no-warnings "$(dirname "$0")/design.mjs"
