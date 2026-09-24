import { useNavigate } from '@tanstack/react-router';
import { useRef } from 'react';
import { EDITOR_ORDER, EDITORS, type MediaKind } from '@/editors/registry';
import { type OpenError, useSession } from '@/media/session';
import { m } from '@/paraglide/messages.js';
import { Tile } from '@/ui/Tile';

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

	const openFiles = async (files: File[]) => {
		const kind = await open(files, prefer);
		if (kind) await navigate({ to: EDITORS[kind].path });
	};

	return (
		<div className="grid gap-3">
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
