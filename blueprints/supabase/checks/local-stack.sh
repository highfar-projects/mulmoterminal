# Sourced, not run: starts the local Supabase stack (yarn db:start, which also writes the local build's settings) and
# resets its database to the migrations and the seed, so what is checked is what the files say.
yarn -s db:start >/dev/null 2>&1 || { echo "yarn db:start failed: the local Supabase stack did not start (is Docker Desktop running?)" >&2; yarn -s db:start >&2 || true; exit 1; }
yarn -s supabase db reset >/dev/null 2>&1 || { echo "the migrations or supabase/seed.sql do not apply to a fresh local database" >&2; yarn -s supabase db reset >&2 || true; exit 1; }
