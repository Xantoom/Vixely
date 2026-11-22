import { ArrowLeft, Languages, Trash2, TriangleAlert } from 'lucide-react';
import { useId, useState } from 'react';
import { PanelTitle } from '@/editor/EditorLayout';
import { Section } from '@/editor/panel-parts';
import { interfaceLanguage, languageName, trackName } from '@/lib/language';
import { m } from '@/paraglide/messages.js';
import { Alert } from '@/ui/Alert';
import { Button } from '@/ui/Button';
import { FieldRow, Select } from '@/ui/fields';
import { LANGUAGES } from '../video/Tracks';
import { whenRead, currentTrackDoc, type TrackKey, useOrigin, useProjectTracks, useSubtitleProject } from './project';
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
	const choose = useSubtitleProject((state) => state.choose);
	const removeAdded = useSubtitleProject((state) => state.removeAdded);
	const originKey = useSubtitleProject(
		(state) => state.tracks.find((track) => track.key === state.current)?.origin?.key ?? null,
	);
	const [deleting, setDeleting] = useState(false);
	const origin = useOrigin();
	const doc = useSubtitleDoc();
	const select = useSubtitleEditor((state) => state.select);
	const ids = { source: useId(), language: useId() };
	const texts = tracks.filter((track) => track.doc && track.doc.format !== 'pgs' && track.doc.cues.length > 0);
	const [source, setSource] = useState<string>(String(current));
	const chosen = texts.find((track) => String(track.key) === source) ?? texts[0];
	const [picked, setLanguage] = useState<string | null>(null);
	// Into the interface's language, or English when the lines are already in it.
	const own = interfaceLanguage();
	const language = picked ?? (chosen?.info?.language === own ? (own === 'eng' ? 'fre' : 'eng') : own);

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
					<div className="flex flex-wrap gap-2">
						{originKey !== null && (
							<Button
								onClick={() => {
									choose(originKey);
								}}
							>
								<ArrowLeft className="size-4.5" aria-hidden="true" />
								{m.translate_leave()}
							</Button>
						)}
						<Button
							onClick={() => {
								// Nothing typed yet: nothing to lose, no question.
								if (origin.size - left > 0) setDeleting(true);
								else if (current !== null) removeAdded(current);
							}}
						>
							<Trash2 className="size-4.5" aria-hidden="true" />
							{m.translate_delete()}
						</Button>
					</div>
				</Section>
			)}
			{deleting && origin && (
				<Alert
					media="subtitles"
					title={m.translate_delete_title()}
					icon={<TriangleAlert className="text-ed-text size-5" aria-hidden="true" />}
					onClose={() => {
						setDeleting(false);
					}}
					actions={
						<>
							<Button
								onClick={() => {
									setDeleting(false);
								}}
							>
								{m.cancel()}
							</Button>
							<Button
								variant="primary"
								onClick={() => {
									setDeleting(false);
									if (current !== null) removeAdded(current);
								}}
							>
								{m.translate_delete_confirm()}
							</Button>
						</>
					}
				>
					{m.translate_delete_body({ count: origin.size - left })}
				</Alert>
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
								void whenRead(chosen.key).then(() => {
									const from = currentTrackDoc(chosen.key);
									if (from) addTrack(translationTrack(from, chosen.key, language));
								});
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
