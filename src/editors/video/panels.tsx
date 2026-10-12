import { Camera, ImagePlus, Trash2 } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { Group } from '@/editor/panel-parts';
import { usePlayback } from '@/media/playback';
import type { OpenedFile } from '@/media/session';
import { m } from '@/paraglide/messages.js';
import { Button } from '@/ui/Button';
import { capturePicture } from './capture';
import { type CoverImage, type VideoMeta } from './document';
import { useVideoDoc, useVideoEditor } from './store';

/** Longest side of a cover made from a picture, in pixels: players show them small. */
const COVER_SIDE = 1280;

/**
 * A picture as a cover: a JPEG or PNG chosen as it is, anything else (a frame of the video, a
 * large picture) as a JPEG.
 */
async function coverFrom(file: Blob, keep = true): Promise<CoverImage> {
	if (keep && (file.type === 'image/jpeg' || file.type === 'image/png') && file.size < 2_000_000) {
		return { data: new Uint8Array(await file.arrayBuffer()), mimeType: file.type };
	}
	const bitmap = await createImageBitmap(file);
	const scale = Math.min(1, COVER_SIDE / Math.max(bitmap.width, bitmap.height));
	const canvas = new OffscreenCanvas(Math.round(bitmap.width * scale), Math.round(bitmap.height * scale));
	canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
	bitmap.close();
	const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.9 });
	return { data: new Uint8Array(await blob.arrayBuffer()), mimeType: 'image/jpeg' };
}

/** A text field that records its value as one undo step, once left. */
function MetaField({
	label,
	value,
	multiline = false,
	type = 'text',
	onCommit,
}: {
	label: string;
	value: string;
	multiline?: boolean;
	type?: 'text' | 'date';
	onCommit: (value: string) => void;
}) {
	const id = useId();
	const [draft, setDraft] = useState<string | null>(null);
	const commit = () => {
		// A date is kept only once whole: year, month and day, as files store it.
		const valid = type !== 'date' || draft === '' || (draft !== null && /^\d{4}-\d{2}-\d{2}$/.test(draft));
		if (draft !== null && draft !== value && valid) onCommit(draft);
		setDraft(null);
	};
	const field =
		'border-field bg-bg text-ui text-ink hover:border-muted w-full cursor-text rounded-xs border px-2.5 transition-colors';
	return (
		<div className="grid gap-1.5">
			<label htmlFor={id} className="text-ui text-ink-2">
				{label}
			</label>
			{multiline ? (
				<textarea
					id={id}
					rows={3}
					value={draft ?? value}
					onChange={(event) => {
						setDraft(event.target.value);
					}}
					onBlur={commit}
					className={`${field} resize-y py-1.5`}
				/>
			) : (
				<input
					id={id}
					type="text"
					inputMode={type === 'date' ? 'numeric' : undefined}
					placeholder={type === 'date' ? m.meta_date_format() : undefined}
					maxLength={type === 'date' ? 10 : undefined}
					value={draft ?? value}
					onChange={(event) => {
						const typed = event.target.value;
						// Dates take their dashes by themselves: 20240315 becomes 2024-03-15.
						setDraft(
							type === 'date'
								? typed
										.replace(/[^\d]/g, '')
										.slice(0, 8)
										.replace(/^(\d{4})(\d)/, '$1-$2')
										.replace(/^(\d{4}-\d{2})(\d)/, '$1-$2')
								: typed,
						);
					}}
					onBlur={commit}
					onKeyDown={(event) => {
						if (event.key === 'Enter') commit();
						if (event.key === 'Escape') setDraft(null);
					}}
					className={`${field} h-8`}
				/>
			)}
		</div>
	);
}

/** The cover as a picture on screen. */
function CoverPreview({ cover }: { cover: CoverImage }) {
	const [url, setUrl] = useState<string | null>(null);
	useEffect(() => {
		const next = URL.createObjectURL(new Blob([cover.data.slice()], { type: cover.mimeType }));
		setUrl(next);
		return () => {
			URL.revokeObjectURL(next);
		};
	}, [cover]);
	return url ? (
		<img src={url} alt={m.meta_cover()} className="bg-surface max-h-40 w-full rounded-sm object-contain" />
	) : null;
}

/**
 * What the file says about itself: title, artist, date, comment and cover, as players and file
 * browsers show them. They start as the file has them.
 */
export function MetadataSection({ opened }: { opened: OpenedFile }) {
	const doc = useVideoDoc();
	const apply = useVideoEditor((state) => state.apply);
	const source = useVideoEditor((state) => state.exportSource?.source.meta ?? null);
	const picker = useRef<HTMLInputElement>(null);
	const [busy, setBusy] = useState(false);
	if (!source) return null;
	const meta = doc.meta ?? source;
	const change = (patch: Partial<VideoMeta>) => {
		apply((current) => ({ ...current, meta: { ...(current.meta ?? source), ...patch } }));
	};
	const setCover = (made: Promise<CoverImage>) => {
		setBusy(true);
		void made
			.then((cover) => {
				change({ cover });
			})
			.catch(() => undefined)
			.finally(() => {
				setBusy(false);
			});
	};
	return (
		<Group
			title={m.meta_title()}
			defaultOpen={false}
			changed={doc.meta !== null}
			onReset={() => {
				apply((current) => ({ ...current, meta: null }));
			}}
		>
			<div className="grid gap-2.5">
				<MetaField
					label={m.meta_name()}
					value={meta.title}
					onCommit={(title) => {
						change({ title });
					}}
				/>
				<MetaField
					label={m.meta_artist()}
					value={meta.artist}
					onCommit={(artist) => {
						change({ artist });
					}}
				/>
				<MetaField
					label={m.meta_date()}
					type="date"
					value={meta.date}
					onCommit={(date) => {
						change({ date });
					}}
				/>
				<MetaField
					label={m.meta_comment()}
					multiline
					value={meta.comment}
					onCommit={(comment) => {
						change({ comment });
					}}
				/>
				<div className="grid gap-1.5">
					<span className="text-ui text-ink-2">{m.meta_cover()}</span>
					{meta.cover ? (
						<CoverPreview cover={meta.cover} />
					) : (
						<p className="text-ui text-muted">{m.meta_no_cover()}</p>
					)}
					<input
						ref={picker}
						type="file"
						accept="image/*"
						hidden
						onChange={(event) => {
							const file = event.target.files?.[0];
							event.target.value = '';
							if (file) setCover(coverFrom(file));
						}}
					/>
					<div className="grid grid-cols-2 gap-2">
						<Button disabled={busy} onClick={() => picker.current?.click()}>
							<ImagePlus size={16} aria-hidden="true" />
							{m.meta_cover_choose()}
						</Button>
						<Button
							disabled={busy}
							onClick={() => {
								setCover(
									capturePicture(opened.file, usePlayback.getState().time).then(async (frame) =>
										coverFrom(frame, false),
									),
								);
							}}
						>
							<Camera size={16} aria-hidden="true" />
							{m.meta_cover_frame()}
						</Button>
					</div>
					{meta.cover && (
						<Button
							onClick={() => {
								change({ cover: null });
							}}
						>
							<Trash2 size={16} aria-hidden="true" />
							{m.meta_cover_remove()}
						</Button>
					)}
				</div>
			</div>
		</Group>
	);
}
