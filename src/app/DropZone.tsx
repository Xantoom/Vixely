import { useNavigate } from '@tanstack/react-router';
import { Link2, Sparkles } from 'lucide-react';
import { useRef, useState } from 'react';
import { EDITOR_ORDER, EDITORS, type MediaKind } from '@/editors/registry';
import { type OpenError, useSession } from '@/media/session';
import { m } from '@/paraglide/messages.js';
import { Button } from '@/ui/Button';
import { Tile } from '@/ui/Tile';
import { FetchFileError, fetchFile, fetchSample } from './fetch-file';
import { ResumeCard } from './ResumeCard';

/** What went wrong downloading a file, for the person who asked. */
export function fetchMessage(failure: unknown): string {
	if (failure instanceof FetchFileError) {
		if (failure.reason === 'address') return m.url_error_address();
		if (failure.reason === 'status') return m.url_error_status({ status: String(failure.status ?? '') });
		return m.url_error_blocked();
	}
	return m.error_unknown();
}

function errorMessage(error: OpenError): string {
	if (error.reason === 'skipped') return m.batch_skipped({ count: error.count });
	if (error.reason === 'legacy') return m.error_legacy({ format: error.format ?? '' });
	if (error.reason === 'read') return m.error_read();
	return m.error_unknown();
}

/**
 * Where files come in. Identifies the dropped file and opens the editor made for it, so the user
 * never has to know in advance which editor to pick.
 */
/** `prefer` is the editor the zone sits in: files that fit it open there, a video's audio included. */
export function DropZone({ compact = false, prefer }: { compact?: boolean; prefer?: MediaKind }) {
	const open = useSession((state) => state.open);
	const reading = useSession((state) => state.reading);
	const error = useSession((state) => state.error);
	const navigate = useNavigate();
	const inputRef = useRef<HTMLInputElement>(null);

	const [address, setAddress] = useState('');
	const [downloading, setDownloading] = useState(false);
	const [fetchError, setFetchError] = useState<string | null>(null);

	const openFiles = async (files: File[]) => {
		const kind = await open(files, prefer);
		// Already in its editor (a task page included): it opens right here.
		if (kind && kind !== prefer) await navigate({ to: EDITORS[kind].path });
	};

	const download = async (get: () => Promise<File>) => {
		setDownloading(true);
		setFetchError(null);
		try {
			await openFiles([await get()]);
			setAddress('');
		} catch (failure) {
			setFetchError(fetchMessage(failure));
		} finally {
			setDownloading(false);
		}
	};

	return (
		<div className="grid gap-3">
			<ResumeCard prefer={prefer} />
			<div
				role="button"
				tabIndex={0}
				aria-describedby={error ? 'drop-error' : undefined}
				onClick={() => inputRef.current?.click()}
				onKeyDown={(event) => {
					if (event.key === 'Enter' || event.key === ' ') {
						event.preventDefault();
						inputRef.current?.click();
					}
				}}
				className={`group grid w-full place-content-center justify-items-center gap-3 rounded-md border-[1.5px] border-dashed px-5 text-center transition-colors duration-150 ${
					compact ? 'min-h-56 py-8' : 'min-h-60 py-8'
				} border-line-2 bg-surface hover:border-ink-2 hover:bg-bg`}
			>
				<span className="flex gap-1.5" aria-hidden="true">
					{EDITOR_ORDER.map((kind, index) => (
						<Tile
							key={kind}
							kind={kind}
							size="lg"
							className={`transition-transform duration-200 ${
								index % 2 === 0 ? 'group-hover:-translate-y-[3px]' : 'group-hover:translate-y-[3px]'
							}`}
						/>
					))}
				</span>
				<span className="mt-1.5 text-lg font-semibold tracking-[-0.015em]">{reading ?? m.drop_title()}</span>
				{!reading && (
					<span className="text-muted text-body">
						{m.drop_or()}{' '}
						<span className="text-ink underline underline-offset-[3px]">{m.drop_choose()}</span>
					</span>
				)}
				<input
					ref={inputRef}
					type="file"
					multiple
					className="hidden"
					tabIndex={-1}
					onChange={(event) => {
						void openFiles([...(event.target.files ?? [])]);
						event.target.value = '';
					}}
				/>
			</div>
			<div className="flex flex-wrap gap-2">
				<form
					className="flex min-w-64 flex-1 gap-2"
					onSubmit={(event) => {
						event.preventDefault();
						if (address.trim()) void download(async () => fetchFile(address));
					}}
				>
					<label className="border-line-2 bg-bg focus-within:border-muted flex h-10 min-w-0 flex-1 items-center gap-2 rounded-sm border px-3 transition-colors">
						<Link2 className="text-muted size-[1.1rem] flex-none" aria-hidden="true" />
						<span className="sr-only">{m.url_label()}</span>
						<input
							type="url"
							value={address}
							placeholder={m.url_placeholder()}
							onChange={(event) => {
								setAddress(event.target.value);
							}}
							className="text-ui min-w-0 flex-1 bg-transparent outline-none"
						/>
					</label>
					<Button type="submit" busy={downloading} disabled={!address.trim()}>
						{downloading ? m.url_reading() : m.url_open()}
					</Button>
				</form>
				{prefer && (
					<Button
						busy={downloading}
						onClick={() => {
							void download(async () => fetchSample(prefer));
						}}
					>
						<Sparkles className="size-[1.1rem]" aria-hidden="true" />
						{m.sample_try()}
					</Button>
				)}
			</div>
			{fetchError && (
				<p role="alert" className="text-body text-danger max-w-[70ch]">
					{fetchError}
				</p>
			)}
			{error && (
				<p
					id="drop-error"
					role="alert"
					className={`text-body max-w-[70ch] ${error.reason === 'skipped' ? 'text-muted' : 'text-danger'}`}
				>
					{errorMessage(error)}
				</p>
			)}
		</div>
	);
}
