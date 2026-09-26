#!/bin/sh
# Every finished target's pull request is in a state the person agreed to: merged when merging is
# automatic, open or merged when they merge it themselves.
set -eu
node "$(dirname "$0")/targets.mjs" prs > .blueprint/.prs
wrong=""
while read -r id url accepted; do
  state=$(gh pr view "$url" --json state -q .state) || { wrong="$wrong
$id: could not read $url"; continue; }
  case ",$accepted," in
    *",$state,"*) ;;
    *) wrong="$wrong
$id: $url is $state, expected $accepted" ;;
  esac
done < .blueprint/.prs
rm -f .blueprint/.prs
[ -z "$wrong" ] || { echo "pull requests not where they should be:$wrong" >&2; exit 1; }
