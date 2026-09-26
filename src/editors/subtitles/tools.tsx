import { Languages, ScanText, Speech } from 'lucide-react';
import { useId, useRef, useState } from 'react';
import { PanelTitle } from '@/editor/EditorLayout';
import { Section } from '@/editor/panel-parts';
import { languageName, trackName } from '@/lib/language';
import { OCR_LANGUAGES, TextReader } from '@/media/ocr';
import { usePlayback } from '@/media/playback';
import type { SpokenLine, TranscribeMessage, TranscribeRequest, WhisperModel } from '@/media/transcribe-protocol';
import { m } from '@/paraglide/messages.js';
import { getLocale } from '@/paraglide/runtime.js';
import { Button } from '@/ui/Button';
import { FieldRow, Select } from '@/ui/fields';
import { LANGUAGES } from '../video/MuxPanel';
import { type Cue, newCueId } from './document';
import { pictureBitmap } from './pgs';
import { currentTrackDoc, type TrackKey, useOrigin, useProjectTracks, useSubtitleProject } from './project';
import { useSubtitleDoc, useSubtitleEditor } from './store';
import { translationTrack, untranslated } from './translate';

/** Name of a track in lists: its language and name, the file's own name, or new subtitles. */
export function projectTrackName(
	track: { key: TrackKey; info: { language: string; name: string } | null },
	fileName: string,
) {
	if (track.info) return trackName(track.info.language, track.info.name);
	return track.key === 'file' ? fileName : m.subs_new_track();
}

/**
 * The Translate tool: a new track in another language, written by hand line by line with the
 * original beside each one. Times, styles and positions come from the original; nothing is
 * translated automatically.
 */
export function TranslatePanel({ fileName }: { fileName: string }) {
	const tracks = useProjectTracks();
	const current = useSubtitleProject((state) => state.current);
	const addTrack = useSubtitleProject((state) => state.addTrack);
	const origin = useOrigin();
	const doc = useSubtitleDoc();
	const select = useSubtitleEditor((state) => state.select);
	const ids = { source: useId(), language: useId() };
	const texts = tracks.filter((track) => track.doc && track.doc.format !== 'pgs' && track.doc.cues.length > 0);
	const [source, setSource] = useState<string>(String(current));
	const chosen = texts.find((track) => String(track.key) === source) ?? texts[0];
	const [language, setLanguage] = useState('eng');

	const left = origin ? untranslated(doc, origin) : 0;
	const next = () => {
		const line = doc.cues.find((cue) => origin?.has(cue.id) && cue.text.trim() === '');
		if (line) select([line.id]);
	};

	return (
		<>
			<PanelTitle>{m.tool_translate()}</PanelTitle>
			{origin && (
				<Section title={m.translate_progress()}>
					<p className="text-body tabular">
						{m.translate_done({ done: origin.size - left, total: origin.size })}
					</p>
					<div
						className="bg-surface-2 h-1.5 overflow-hidden rounded-full"
						role="progressbar"
						aria-label={m.translate_progress()}
						aria-valuemin={0}
						aria-valuemax={origin.size}
						aria-valuenow={origin.size - left}
					>
						<div
							className="bg-ed h-full"
							style={{ width: `${((origin.size - left) / Math.max(1, origin.size)) * 100}%` }}
						/>
					</div>
					<Button disabled={left === 0} onClick={next}>
						{m.translate_next()}
					</Button>
				</Section>
			)}
			<Section title={m.translate_new()}>
				{texts.length === 0 ? (
					<p className="text-ui text-muted">{m.translate_nothing()}</p>
				) : (
					<div className="grid gap-2.5">
						<FieldRow label={m.translate_from()} htmlFor={ids.source}>
							<Select
								id={ids.source}
								value={String(chosen?.key)}
								options={texts.map((track) => ({
									value: String(track.key),
									label: projectTrackName(track, fileName),
								}))}
								onChange={setSource}
							/>
						</FieldRow>
						<FieldRow label={m.translate_into()} htmlFor={ids.language}>
							<Select
								id={ids.language}
								value={language}
								options={LANGUAGES.filter((code) => code !== 'und').map((code) => ({
									value: code,
									label: languageName(code),
								}))}
								onChange={setLanguage}
							/>
						</FieldRow>
						<Button
							variant="primary"
							disabled={!chosen}
							onClick={() => {
								if (!chosen) return;
								const from = currentTrackDoc(chosen.key);
								if (!from) return;
								addTrack(translationTrack(from, chosen.key, language));
							}}
						>
							<Languages size={16} aria-hidden="true" />
							{m.translate_start()}
						</Button>
					</div>
				)}
			</Section>
		</>
	);
}

type WorkState =
	| { step: 'idle' }
	| { step: 'loading'; share: number }
	| { step: 'working'; done: number; total: number }
	| { step: 'failed' };

/** The interface language as an ISO 639-2 code, for what is made here. */
export function interfaceLanguage(): string {
	return getLocale() === 'fr' ? 'fre' : 'eng';
}

/** Where a long job is: downloading what it needs, then working through the lines. */
function WorkProgress({
	state,
	onStop,
	parts = false,
}: {
	state: WorkState;
	onStop: () => void;
	/** Counts parts of the sound rather than lines. */
	parts?: boolean;
}) {
	if (state.step === 'idle') return null;
	if (state.step === 'failed') {
		return (
			<p role="alert" className="text-small text-danger">
				{m.work_failed()}
			</p>
		);
	}
	const share = state.step === 'loading' ? state.share : state.done / Math.max(1, state.total);
	return (
		<div className="grid gap-2" role="status">
			<p className="text-ui tabular">
				{state.step === 'loading'
					? m.work_downloading({ percent: Math.floor(state.share * 100) })
					: parts
						? m.work_parts({ done: state.done, total: state.total })
						: m.work_lines({ done: state.done, total: state.total })}
			</p>
			<div className="bg-surface-2 h-1.5 overflow-hidden rounded-full" aria-hidden="true">
				<div className="bg-ed h-full transition-[width] duration-200" style={{ width: `${share * 100}%` }} />
			</div>
			<Button onClick={onStop}>{m.stop()}</Button>
		</div>
	);
}

/**
 * The Text recognition tool: Blu-ray subtitles, which are pictures, read into a new text track
 * with the same times. The engine and the language's data load the first time.
 */
export function OcrPanel({ fileName }: { fileName: string }) {
	const tracks = useProjectTracks();
	const current = useSubtitleProject((state) => state.current);
	const addTrack = useSubtitleProject((state) => state.addTrack);
	const ids = { source: useId(), language: useId() };
	const pictures = tracks.filter((track) => track.doc?.format === 'pgs');
	const [source, setSource] = useState<string>(String(current));
	const chosen = pictures.find((track) => String(track.key) === source) ?? pictures[0];
	const guessed = chosen?.info?.language ?? '';
	const [picked, setLanguage] = useState<string | null>(null);
	const language = picked ?? (guessed in OCR_LANGUAGES ? guessed : interfaceLanguage());
	const [state, setState] = useState<WorkState>({ step: 'idle' });
	const stopped = useRef(false);
	const busy = state.step === 'loading' || state.step === 'working';

	const run = async () => {
		const doc = chosen ? currentTrackDoc(chosen.key) : null;
		if (!chosen || !doc) return;
		stopped.current = false;
		setState({ step: 'loading', share: 0 });
		let reader: TextReader | null = null;
		try {
			reader = await TextReader.start(language, (share) => {
				setState({ step: 'loading', share });
			});
			const lines = doc.cues.filter((cue) => cue.picture && !cue.comment);
			const cues: Cue[] = [];
			for (const [index, cue] of lines.entries()) {
				if (stopped.current) break;
				setState({ step: 'working', done: index, total: lines.length });
				// oxlint-disable-next-line no-await-in-loop -- one picture at a time
				const bitmap = cue.picture ? await pictureBitmap(cue.picture) : null;
				if (!bitmap) continue;
				// The decoded picture stays with its line: the worker gets a copy.
				// oxlint-disable-next-line no-await-in-loop -- one picture at a time
				const text = await reader.read(await createImageBitmap(bitmap));
				if (text) cues.push({ id: newCueId(), start: cue.start, end: cue.end, text });
			}
			if (stopped.current) {
				setState({ step: 'idle' });
				return;
			}
			addTrack({
				doc: { format: 'srt', cues, ass: null, vttHeader: null },
				language,
				forced: chosen.info?.forced ?? false,
				name: chosen.info?.name ?? '',
			});
			setState({ step: 'idle' });
		} catch {
			setState({ step: 'failed' });
		} finally {
			reader?.dispose();
		}
	};

	return (
		<>
			<PanelTitle>{m.tool_ocr()}</PanelTitle>
			<div className="grid gap-2.5">
				<FieldRow label={m.translate_from()} htmlFor={ids.source}>
					<Select
						id={ids.source}
						value={String(chosen?.key)}
						options={pictures.map((track) => ({
							value: String(track.key),
							label: projectTrackName(track, fileName),
						}))}
						onChange={setSource}
					/>
				</FieldRow>
				<FieldRow label={m.ocr_language()} htmlFor={ids.language}>
					<Select
						id={ids.language}
						value={language}
						options={Object.keys(OCR_LANGUAGES).map((code) => ({ value: code, label: languageName(code) }))}
						onChange={setLanguage}
					/>
				</FieldRow>
				<Button variant="primary" disabled={!chosen || busy} onClick={() => void run()}>
					<ScanText size={16} aria-hidden="true" />
					{m.ocr_start()}
				</Button>
				<WorkProgress
					state={state}
					onStop={() => {
						stopped.current = true;
					}}
				/>
			</div>
		</>
	);
}

/** Whisper's names of the languages it hears, by ISO 639-2 code. */
const SPOKEN: Record<string, string> = {
	eng: 'english',
	fre: 'french',
	ger: 'german',
	spa: 'spanish',
	ita: 'italian',
	por: 'portuguese',
	dut: 'dutch',
	jpn: 'japanese',
	chi: 'chinese',
	kor: 'korean',
	rus: 'russian',
	ara: 'arabic',
	pol: 'polish',
	swe: 'swedish',
};

const AUTO = 'auto';

/** Models offered, with what they download the first time. */
const MODELS: { id: WhisperModel; label: () => string; size: string }[] = [
	{ id: 'tiny', label: () => m.whisper_fast(), size: '40 MB' },
	{ id: 'base', label: () => m.whisper_balanced(), size: '80 MB' },
	{ id: 'small', label: () => m.whisper_accurate(), size: '250 MB' },
];

/**
 * The Transcribe tool: what is said in the video or sound turned into a new subtitle track, timed
 * line by line, to correct in the editor. Whisper runs on this device; its model is downloaded the
 * first time.
 */
export function TranscribePanel() {
	const file = usePlayback((state) => state.file);
	const audioTrack = usePlayback((state) => state.audioTrack);
	const addTrack = useSubtitleProject((state) => state.addTrack);
	const ids = { model: useId(), language: useId() };
	const [model, setModel] = useState<WhisperModel>('base');
	const [language, setLanguage] = useState(AUTO);
	const [state, setState] = useState<WorkState>({ step: 'idle' });
	const worker = useRef<Worker | null>(null);
	const busy = state.step === 'loading' || state.step === 'working';

	const finish = (lines: SpokenLine[]) => {
		worker.current?.terminate();
		worker.current = null;
		setState({ step: 'idle' });
		if (lines.length === 0) return;
		addTrack({
			doc: {
				format: 'srt',
				cues: lines.map((line) => ({
					id: newCueId(),
					start: Math.round(line.start * 1000),
					end: Math.round(line.end * 1000),
					text: line.text,
				})),
				ass: null,
				vttHeader: null,
			},
			language: language === AUTO ? 'und' : language,
		});
	};

	const run = () => {
		if (!file) return;
		const lines: SpokenLine[] = [];
		const next = new Worker(new URL('../../workers/transcribe.worker.ts', import.meta.url), { type: 'module' });
		worker.current = next;
		setState({ step: 'loading', share: 0 });
		next.onmessage = (event: MessageEvent<TranscribeMessage>) => {
			const message = event.data;
			if (message.type === 'loading') setState({ step: 'loading', share: message.share });
			else if (message.type === 'progress') {
				lines.push(...message.lines);
				setState({ step: 'working', done: message.done, total: message.total });
			} else if (message.type === 'done') finish(lines);
			else {
				console.error('[transcribe]', message.message);
				next.terminate();
				worker.current = null;
				setState({ step: 'failed' });
			}
		};
		const request: TranscribeRequest = {
			file,
			track: audioTrack,
			model,
			language: language === AUTO ? null : (SPOKEN[language] ?? null),
		};
		next.postMessage(request);
		// Stopping keeps the lines heard so far.
		stop.current = () => {
			finish(lines);
		};
	};
	const stop = useRef<() => void>(() => undefined);

	return (
		<>
			<PanelTitle>{m.tool_transcribe()}</PanelTitle>
			<div className="grid gap-2.5">
				<FieldRow label={m.whisper_model()} htmlFor={ids.model}>
					<Select
						id={ids.model}
						value={model}
						options={MODELS.map((option) => ({
							value: option.id,
							label: option.label(),
							detail: option.size,
						}))}
						onChange={setModel}
					/>
				</FieldRow>
				<FieldRow label={m.whisper_language()} htmlFor={ids.language}>
					<Select
						id={ids.language}
						value={language}
						options={[
							{ value: AUTO, label: m.whisper_auto() },
							...Object.keys(SPOKEN).map((code) => ({ value: code, label: languageName(code) })),
						]}
						onChange={setLanguage}
					/>
				</FieldRow>
				<Button variant="primary" disabled={!file || busy} onClick={run}>
					<Speech size={16} aria-hidden="true" />
					{m.whisper_start()}
				</Button>
				<WorkProgress
					state={state}
					parts
					onStop={() => {
						stop.current();
					}}
				/>
			</div>
		</>
	);
}
