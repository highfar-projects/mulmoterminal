#!/bin/sh
# Node is new enough for wrangler, and yarn answers. wrangler itself is a dev dependency of the project.
set -eu
node -e 'process.exit(Number(process.versions.node.split(".")[0]) >= 22 ? 0 : 1)' ||
  { echo "Node.js 22 or later is needed (wrangler requires it); this is $(node -v)" >&2; exit 1; }
yarn --version >/dev/null 2>&1 || { echo "yarn is missing (corepack enable)" >&2; exit 1; }
