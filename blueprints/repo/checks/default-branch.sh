#!/bin/sh
# Prints the repository's default branch, as GitHub has it.
set -eu
gh repo view --json defaultBranchRef -q .defaultBranchRef.name
