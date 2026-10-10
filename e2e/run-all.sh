#!/usr/bin/env bash
# Runs the scenarios named, the groups named (image, gif, audio, subtitles, video, shell) or every
# one, in one browser (BROWSER=chromium|firefox|webkit), and keeps each output in runs/. Each
# browser works in its own folder, work/<browser>, so two can run at once: what a scenario saves
# goes to its shots/ there, and samples/ and ../public reach the shared ones.
cd "$(dirname "$0")"
root=$PWD
browser=${BROWSER:-chromium}
# The scenarios that check exported files with FFmpeg find it here unless FFPROBE says otherwise.
if [[ -z $FFPROBE && -x $HOME/.local/share/vixely-tools/ffprobe ]]; then
	export FFPROBE=$HOME/.local/share/vixely-tools/ffprobe
fi
mkdir -p runs "work/$browser/shots"
ln -sfn "$root/../public" work/public
ln -sfn "$root/samples" "work/$browser/samples"
ln -sfn "$root/node_modules" "work/$browser/node_modules"
cd "work/$browser"
# A group name stands for its scenarios, for a quick pass over what a change touches.
declare -A groups=(
	[image]="image-editor image-overlays"
	[gif]="gif-editor gif-formats gif-effects gif-batch gif-images"
	[audio]="audio-sound audio-tools"
	[subtitles]="subtitles-editor subtitles-tracks subtitles-mux subtitles-batch subtitles-tools subtitles-styles"
	[video]="video-editor video-added video-tracks video-hdr video-export video-complete video-batch"
	[shell]="site-pages editors-roundtrip compare keyboard layout"
)
all="${groups[shell]%% *} ${groups[image]} ${groups[gif]} ${groups[audio]} ${groups[subtitles]} ${groups[video]} ${groups[shell]#* }"
scenarios=()
for name in ${@:-$all}; do scenarios+=(${groups[$name]:-$name}); done
# Several run at once (JOBS, the cores over two by default), the longest first so they don't end
# alone; each line is printed as its scenario ends.
jobs=${JOBS:-$(( $(nproc) / 2 ))}
longest="video-export video-complete layout image-editor keyboard subtitles-tools video-editor"
ordered=()
for scenario in $longest; do [[ " ${scenarios[*]} " == *" $scenario "* ]] && ordered+=("$scenario"); done
for scenario in "${scenarios[@]}"; do [[ " $longest " == *" $scenario "* ]] || ordered+=("$scenario"); done
run() {
	local scenario=$1 out="$root/runs/$browser-$1.txt" start=$(date +%s) status last
	timeout 900 bun "$root/$scenario.ts" > "$out" 2>&1
	status=$?
	last=$(grep -E "^(no errors|errors:)" "$out" | tail -1 | cut -c1-160)
	echo "$scenario [$status, $(( $(date +%s) - start )) s] ${last:-$(grep -E 'Error|error' "$out" | grep -v '^\s*[0-9]* |' | head -1 | cut -c1-160)}"
}
began=$(date +%s)
for scenario in "${ordered[@]}"; do
	while (( $(jobs -rp | wc -l) >= jobs )); do wait -n; done
	run "$scenario" &
done
wait
echo "all done in $(( $(date +%s) - began )) s"
