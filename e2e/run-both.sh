#!/usr/bin/env bash
# Runs run-all.sh in Chromium and Firefox at once, with the same arguments, each line marked with
# its browser.
cd "$(dirname "$0")"
BROWSER=chromium ./run-all.sh "$@" | sed -u 's/^/chromium  /' &
BROWSER=firefox ./run-all.sh "$@" | sed -u 's/^/firefox   /' &
wait
