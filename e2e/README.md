# Browser checks

Scenarios that drive the real app in headless Chromium and print what they measure: exported sizes, frame counts,
durations, levels. They complement the unit tests, which can't run WebCodecs, WebGL or workers.

```bash
cd e2e && bun install && bun run browsers   # once
bun run dev                                 # in the repository root, in another terminal
bun gif-formats.ts                          # any scenario
```

Samples the scenarios need are generated on the fly, or created by `bun samples.ts` into `e2e/samples/` (ignored by
git).

| Scenario              | What it checks                                                                                                                                 |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `gif-editor.ts`       | GIF editing (trim, speed, crop), a video made into a GIF                                                                                       |
| `gif-formats.ts`      | GIF, APNG, WebP and video exports, Original, maximum size                                                                                      |
| `gif-batch.ts`        | A batch of GIFs exported together                                                                                                              |
| `subtitles-editor.ts` | A Windows-1252 SRT, a preview video dropped on it, grid, edit box and audio box (Aegisub layout), shift, two-point sync, ASS ↔ SRT             |
| `subtitles-tracks.ts` | Subtitle tracks of MKV and MP4 files, embedded fonts, PGS pictures read and written; `bun subtitles-tracks.ts big.mkv` also times a large file |
| `subtitles-mux.ts`    | Subtitles back into MKV and MP4 files (edited SRT, new timed text, shifted PGS), reopened; `bun subtitles-mux.ts big.mkv` times a large export |
| `video-editor.ts`     | Video editor: crop and colours on every picture, undo, timeline pictures, a removed passage skipped with and without sound, a phone video shown upright, a picture opened in the image editor |
| `video-export.ts`     | Video export: an MKV with a passage removed and colours changed (subtitles moved up, fonts kept), an MP4 with timed text, a 480p WebM, a trimmed MKV copied without re-encoding, MKV and MP4 with passages removed copied from key frames, the sound made louder and a WAV added (copied and converted), ASS and PGS subtitles burned in; `FFPROBE=…/ffprobe` checks each file and extracts burned frames |
| `subtitles-batch.ts`  | SRT, ASS and .sup files shifted together and written as WebVTT into a ZIP                                                                      |
