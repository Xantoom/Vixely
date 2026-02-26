import type { ReactNode } from 'react';
import { Info } from 'lucide-react';

interface EditorFileSummaryProps {
	fileName: string;
	meta?: string | null;
	onInfo?: () => void;
	infoLabel?: string;
	leading?: ReactNode;
}

export function EditorFileSummary({
	fileName,
	meta,
	onInfo,
	infoLabel = 'Open file info',
	leading,
}: EditorFileSummaryProps) {
	return (
		<div className="rounded-lg border border-border/60 bg-bg/35 px-2.5 py-2 text-[12px] text-text-tertiary">
			<div className="flex items-center gap-2">
				{leading}
				<p className="min-w-0 flex-1 truncate text-text-secondary font-medium">{fileName}</p>
				{onInfo && (
					<button
						onClick={onInfo}
						type="button"
						aria-label={infoLabel}
						title="File info"
						className="h-5 w-5 shrink-0 flex items-center justify-center rounded text-text-tertiary hover:text-text-secondary transition-colors cursor-pointer"
					>
						<Info size={12} />
					</button>
				)}
			</div>
			{meta && <p className="mt-0.5 truncate">{meta}</p>}
		</div>
	);
}
