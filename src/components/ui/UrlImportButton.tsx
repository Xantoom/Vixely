import { Link as LinkIcon, LoaderCircle } from 'lucide-react';
import { useCallback, useState } from 'react';
import { toast } from 'sonner';
import { fetchRemoteAsFile } from '@/modules/shared-core/mediaInput.ts';

interface UrlImportButtonProps {
	onFile: (file: File) => void;
	acceptFile?: (file: File) => boolean;
	label?: string;
	placeholder?: string;
	className?: string;
}

function sniffUrl(input: string): string | null {
	const trimmed = input.trim();
	if (!trimmed) return null;
	try {
		const url = new URL(trimmed);
		if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
		return url.toString();
	} catch {
		return null;
	}
}

export function UrlImportButton({
	onFile,
	acceptFile,
	label = 'Load from URL',
	placeholder = 'https://example.com/video.mp4',
	className,
}: UrlImportButtonProps) {
	const [open, setOpen] = useState(false);
	const [value, setValue] = useState('');
	const [loading, setLoading] = useState(false);
	const [progress, setProgress] = useState(0);

	const handleImport = useCallback(async () => {
		const url = sniffUrl(value);
		if (!url) {
			toast.error('Invalid URL', { description: 'Enter a direct https:// link to a media file.' });
			return;
		}
		setLoading(true);
		setProgress(0);
		try {
			const file = await fetchRemoteAsFile(url, { onProgress: setProgress });
			if (acceptFile && !acceptFile(file)) {
				toast.error('Unsupported file type', { description: file.type || 'Unknown MIME type' });
				return;
			}
			onFile(file);
			setOpen(false);
			setValue('');
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			if (/CORS|NetworkError|Failed to fetch/i.test(message)) {
				toast.error('Cannot fetch remote file', {
					description: 'The server must allow cross-origin requests (CORS) or serve a Range header.',
				});
			} else {
				toast.error('Failed to load URL', { description: message });
			}
		} finally {
			setLoading(false);
			setProgress(0);
		}
	}, [value, acceptFile, onFile]);

	if (!open) {
		return (
			<button
				type="button"
				onClick={() => {
					setOpen(true);
				}}
				className={
					className ??
					'inline-flex items-center gap-1.5 rounded-md border border-border/60 bg-surface-raised/60 px-3 py-1.5 text-[12px] font-medium text-text-secondary transition-colors hover:text-text cursor-pointer'
				}
			>
				<LinkIcon size={12} />
				{label}
			</button>
		);
	}

	return (
		<div className="flex w-full max-w-lg flex-col gap-2 rounded-xl border border-border/60 bg-surface/60 p-3">
			<label className="text-[11px] font-semibold uppercase tracking-widest text-text-tertiary">
				Fetch media from URL
			</label>
			<div className="flex gap-2">
				<input
					type="url"
					value={value}
					onChange={(e) => {
						setValue(e.target.value);
					}}
					onKeyDown={(e) => {
						if (e.key === 'Enter') void handleImport();
						if (e.key === 'Escape') setOpen(false);
					}}
					placeholder={placeholder}
					autoFocus
					disabled={loading}
					className="flex-1 rounded-md border border-border bg-surface-raised/60 px-2.5 py-1.5 text-[13px] text-text focus:border-accent/50 focus:outline-none"
				/>
				<button
					type="button"
					onClick={() => void handleImport()}
					disabled={loading || !value.trim()}
					className="inline-flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-[12px] font-semibold text-white transition-opacity disabled:opacity-50 cursor-pointer"
				>
					{loading ? <LoaderCircle size={12} className="animate-spin" /> : <LinkIcon size={12} />}
					{loading ? 'Loading…' : 'Load'}
				</button>
				<button
					type="button"
					onClick={() => {
						setOpen(false);
						setValue('');
					}}
					disabled={loading}
					className="rounded-md border border-border bg-surface-raised/60 px-2.5 py-1.5 text-[12px] text-text-tertiary transition-colors hover:text-text disabled:opacity-50 cursor-pointer"
				>
					Cancel
				</button>
			</div>
			{loading && progress > 0 && (
				<div className="h-1 w-full overflow-hidden rounded-full bg-surface-raised/70">
					<div
						className="h-full bg-accent transition-all"
						style={{ width: `${Math.round(progress * 100)}%` }}
					/>
				</div>
			)}
			<p className="text-[11px] text-text-tertiary">
				The server must allow cross-origin requests. Your browser streams the file directly — Vixely still never
				sees your content.
			</p>
		</div>
	);
}
