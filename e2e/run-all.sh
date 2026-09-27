#!/usr/bin/env bash
# Runs the scenarios named, the groups named (image, gif, audio, subtitles, video, shell) or every
# one, in one browser (BROWSER=chromium|firefox|webkit), and keeps each output in runs/. Each
# browser works in its own folder, work/<browser>, so two can run at once: what a scenario saves
# goes to its shots/ there, and samples/ and ../public reach the shared ones.
cd "$(dirname "$0")"
root=$PWD
browser=${BROWSER:-chromium}
mkdir -p runs "work/$browser/shots"
ln -sfn "$root/../public" work/public
ln -sfn "$root/samples" "work/$browser/samples"
ln -sfn "$root/node_modules" "work/$browser/node_modules"
cd "work/$browser"
# A group name stands for its scenarios, for a quick pass over what a change touches.
declare -A groups=(
	[image]="image-editor image-overlays"
	[gif]="gif-editor gif-formats gif-effects gif-batch"
	[audio]="audio-sound"
	[subtitles]="subtitles-editor subtitles-tracks subtitles-mux subtitles-batch subtitles-tools"
	[video]="video-editor video-export video-complete video-batch"
	[shell]="site-pages resume editors-roundtrip keyboard layout"
)
all="${groups[shell]%% *} ${groups[image]} ${groups[gif]} ${groups[audio]} ${groups[subtitles]} ${groups[video]} ${groups[shell]#* }"
scenarios=()
for name in ${@:-$all}; do scenarios+=(${groups[$name]:-$name}); done
for scenario in "${scenarios[@]}"; do
	out="$root/runs/$browser-$scenario.txt"
	start=$(date +%s)
	timeout 900 bun "$root/$scenario.ts" > "$out" 2>&1
	status=$?
	last=$(grep -E "^(no errors|errors:)" "$out" | tail -1 | cut -c1-160)
	echo "$scenario [$status, $(( $(date +%s) - start )) s] ${last:-$(grep -E 'Error|error' "$out" | grep -v '^\s*[0-9]* |' | head -1 | cut -c1-160)}"
done
