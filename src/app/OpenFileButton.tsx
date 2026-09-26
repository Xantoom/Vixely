import { useNavigate } from '@tanstack/react-router';
import { Upload } from 'lucide-react';
import { type ReactNode, useRef } from 'react';
import { EDITORS } from '@/editors/registry';
import { useSession } from '@/media/session';

/**
 * Opens files from a button, in the editor made for them: the way in of the pages around the
 * editors, where the whole window also takes dropped and pasted files.
 */
export function OpenFileButton({
	children,
	reading,
	className = '',
}: {
	children: ReactNode;
	/** Shown while a file is read. */
	reading: string;
	className?: string;
}) {
	const open = useSession((state) => state.open);
	const busy = useSession((state) => state.reading !== null);
	const navigate = useNavigate();
	const inputRef = useRef<HTMLInputElement>(null);
	return (
		<>
			<button
				type="button"
				aria-disabled={busy || undefined}
				onClick={() => {
					if (!busy) inputRef.current?.click();
				}}
				className={`bg-ink text-bg inline-flex items-center justify-center gap-2.5 font-semibold whitespace-nowrap transition-[filter] duration-150 hover:brightness-125 aria-disabled:opacity-60 ${className}`}
			>
				<Upload className="size-[1.15em]" aria-hidden="true" />
				{busy ? reading : children}
			</button>
			<input
				ref={inputRef}
				type="file"
				multiple
				className="hidden"
				tabIndex={-1}
				onChange={(event) => {
					const files = [...(event.target.files ?? [])];
					event.target.value = '';
					void open(files).then(async (kind) => {
						if (kind) await navigate({ to: EDITORS[kind].path });
					});
				}}
			/>
		</>
	);
}
