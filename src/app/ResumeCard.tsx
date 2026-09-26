import { useNavigate } from '@tanstack/react-router';
import { RotateCcw, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { EDITORS, type MediaKind } from '@/editors/registry';
import { m } from '@/paraglide/messages.js';
import { getLocale } from '@/paraglide/runtime.js';
import { Button, IconButton } from '@/ui/Button';
import { Tile } from '@/ui/Tile';
import { checkSaved, forget, isReload, resume, useResume } from './resume';

/** "5 minutes ago", in the page's language. */
function ago(time: number): string {
	const seconds = (time - Date.now()) / 1000;
	const format = new Intl.RelativeTimeFormat(getLocale(), { numeric: 'auto' });
	const steps: [Intl.RelativeTimeFormatUnit, number][] = [
		['day', 86_400],
		['hour', 3600],
		['minute', 60],
	];
	for (const [unit, length] of steps) {
		if (Math.abs(seconds) >= length) return format.format(Math.round(seconds / length), unit);
	}
	return format.format(0, 'second');
}

/** Only once per page load: after that, a reload's work is either taken up or dismissed. */
let reloadHandled = false;

/**
 * Work kept from a closed tab, offered again where files are opened. After a reload it comes back
 * by itself in the editor it was in. Files too large to be kept are asked for again.
 */
export function ResumeCard({ prefer }: { prefer?: MediaKind }) {
	const saved = useResume((state) => state.saved);
	const checked = useResume((state) => state.checked);
	const navigate = useNavigate();
	const inputRef = useRef<HTMLInputElement>(null);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const go = async (chosen?: File[]) => {
		setBusy(true);
		setError(null);
		const kind = await resume(chosen).catch(() => null);
		setBusy(false);
		if (!kind) {
			setError(chosen ? m.resume_mismatch() : m.resume_failed());
			return;
		}
		if (kind !== prefer) await navigate({ to: EDITORS[kind].path });
	};

	useEffect(() => {
		void checkSaved();
	}, []);

	useEffect(() => {
		if (!checked || reloadHandled) return;
		reloadHandled = true;
		if (saved && isReload() && saved.stored && saved.kind === prefer) void go();
		// Only once what was kept is first known.
		// oxlint-disable-next-line react-hooks/exhaustive-deps
	}, [checked]);

	if (!saved) return null;
	const [first] = saved.files;
	return (
		<div data-media={saved.kind} className="border-line-2 bg-surface grid gap-2 rounded-md border p-3">
			<div className="flex items-center gap-3">
				<Tile kind={saved.files.length > 1 ? 'batch' : saved.kind} />
				<div className="grid min-w-0 flex-1">
					<span className="text-caption text-muted">
						{m.resume_title()} · {ago(saved.savedAt)}
					</span>
					<span className="text-ui truncate font-medium">
						{first?.name}
						{saved.files.length > 1 && (
							<span className="text-muted"> {m.resume_more({ count: saved.files.length - 1 })}</span>
						)}
					</span>
				</div>
				<Button
					variant="primary"
					busy={busy}
					onClick={() => {
						if (saved.stored) void go();
						else inputRef.current?.click();
					}}
				>
					<RotateCcw className="size-[1.1rem]" aria-hidden="true" />
					{m.resume_action()}
				</Button>
				<IconButton
					label={m.resume_forget()}
					onClick={() => {
						void forget();
					}}
				>
					<X className="size-5" />
				</IconButton>
				{/* Only when the files have to be picked again. */}
				{!saved.stored && (
					<input
						ref={inputRef}
						type="file"
						multiple
						className="hidden"
						tabIndex={-1}
						onChange={(event) => {
							void go([...(event.target.files ?? [])]);
							event.target.value = '';
						}}
					/>
				)}
			</div>
			{error && (
				<p role="alert" className="text-body text-danger">
					{error}
				</p>
			)}
		</div>
	);
}
