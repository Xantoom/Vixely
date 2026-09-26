#!/usr/bin/env bash
# Runs every scenario in one browser (BROWSER=chromium|firefox|webkit) and keeps each output in runs/.
cd "$(dirname "$0")"
browser=${BROWSER:-chromium}
mkdir -p runs
for scenario in ${@:-site-pages image-editor image-overlays gif-editor gif-formats gif-effects gif-batch audio-sound subtitles-editor subtitles-tracks subtitles-mux subtitles-batch subtitles-tools video-editor video-export video-complete video-batch resume}; do
	start=$(date +%s)
	timeout 900 bun "$scenario.ts" > "runs/$browser-$scenario.txt" 2>&1
	status=$?
	last=$(grep -E "^(no errors|errors:)" "runs/$browser-$scenario.txt" | tail -1 | cut -c1-160)
	echo "$scenario [$status, $(( $(date +%s) - start )) s] ${last:-$(grep -E 'Error|error' "runs/$browser-$scenario.txt" | grep -v '^\s*[0-9]* |' | head -1 | cut -c1-160)}"
done
