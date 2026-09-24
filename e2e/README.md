# Browser checks

Scenarios that drive the real app in headless Chromium and print what they measure: exported
sizes, frame counts, durations, levels. They complement the unit tests, which can't run WebCodecs,
WebGL or workers.

```bash
cd e2e && bun install && bun run browsers   # once
bun run dev                                 # in the repository root, in another terminal
bun gif-formats.ts                          # any scenario
```

Samples the scenarios need are generated on the fly, or created by `bun samples.ts` into
`e2e/samples/` (ignored by git).

| Scenario | What it checks |
| --- | --- |
| `gif-editor.ts` | GIF editing (trim, speed, crop), a video made into a GIF |
| `gif-formats.ts` | GIF, APNG, WebP and video exports, Original, maximum size |
| `gif-batch.ts` | A batch of GIFs exported together |
| `subtitles-editor.ts` | A Windows-1252 SRT with a preview video, line editing, shift, two-point sync, ASS ↔ SRT |
