#!/bin/sh
# Every finished target's pull request is its own — opened from the target's branch,
# blueprint/<target id> — and in a state the person agreed to: merged when merging is automatic, open
# or merged when they merge it themselves.
set -eu
node "$(dirname "$0")/targets.mjs" prs > .blueprint/.prs
wrong=""
while read -r id url accepted; do
  found=$(gh pr view "$url" --json state,headRefName -q '"\(.state) \(.headRefName)"') || { wrong="$wrong
$id: could not read $url"; continue; }
  state=${found%% *}
  branch=${found#* }
  [ "$branch" = "blueprint/$id" ] || wrong="$wrong
$id: $url comes from $branch, not blueprint/$id"
  case ",$accepted," in
    *",$state,"*) ;;
    *) wrong="$wrong
$id: $url is $state, expected $accepted" ;;
  esac
done < .blueprint/.prs
rm -f .blueprint/.prs
[ -z "$wrong" ] || { echo "pull requests not where they should be:$wrong" >&2; exit 1; }
