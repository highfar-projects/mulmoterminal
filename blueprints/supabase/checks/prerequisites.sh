#!/bin/sh
# Node is new enough, yarn answers, and Docker is running for the local Supabase stack. The Supabase CLI and wrangler are
# dev dependencies of the project.
set -eu
node -e 'process.exit(Number(process.versions.node.split(".")[0]) >= 22 ? 0 : 1)' ||
  { echo "Node.js 22 or later is needed; this is $(node -v)" >&2; exit 1; }
yarn --version >/dev/null 2>&1 || { echo "yarn is missing (corepack enable)" >&2; exit 1; }
docker info >/dev/null 2>&1 || { echo "Docker is not running; start Docker Desktop (the local Supabase stack runs in it)" >&2; exit 1; }
