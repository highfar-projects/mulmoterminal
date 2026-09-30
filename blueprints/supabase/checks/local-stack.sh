# Sourced, not run: starts the local Supabase stack (yarn db:start, which also writes the local build's settings) and
# resets its database to the migrations and the seed, so what is checked is what the files say.
# A running stack keeps the supabase/config.toml it started with (sign-up, redirect URLs, ...) and db:start leaves a
# running stack alone, so the stack is stopped first unless it was last started here from this very config.
local_stack_stamp=.blueprint/local-stack-config
local_stack_config=$(cksum 2>/dev/null < supabase/config.toml || true)
if [ "$(cat "$local_stack_stamp" 2>/dev/null)" != "$local_stack_config" ]; then
  yarn -s supabase stop >/dev/null 2>&1 || { echo "yarn supabase stop failed, so the stack would keep its old supabase/config.toml" >&2; yarn -s supabase stop >&2 || true; exit 1; }
fi

# Another project's local stack holds the same default ports, and supabase start then fails: name it when there is one.
local_stack_own_id=$(sed -n 's/^project_id *= *"\([^"]*\)".*/\1/p' supabase/config.toml 2>/dev/null || true)
local_stack_others() {
  docker ps --format '{{.Names}}' 2>/dev/null | sed -n 's/^supabase_db_//p' | grep -Fvx -e "$local_stack_own_id" | tr '\n' ' '
}

if ! yarn -s db:start >/dev/null 2>&1; then
  local_stack_running=$(local_stack_others)
  if [ -n "$local_stack_running" ]; then
    echo "yarn db:start failed: another project's local Supabase stack is running (${local_stack_running% }) and may hold the same ports; stop it (yarn supabase stop --project-id <id>) or give this project other ports in supabase/config.toml" >&2
  else
    echo "yarn db:start failed: the local Supabase stack did not start (is Docker Desktop running?)" >&2
  fi
  yarn -s db:start >&2 || true
  exit 1
fi
mkdir -p .blueprint && printf '%s\n' "$local_stack_config" > "$local_stack_stamp"
yarn -s supabase db reset >/dev/null 2>&1 || { echo "the migrations or supabase/seed.sql do not apply to a fresh local database" >&2; yarn -s supabase db reset >&2 || true; exit 1; }
