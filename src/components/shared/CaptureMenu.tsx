import { Download, Palette } from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { createPortal } from 'react-dom';

export type CaptureFormat = 'png' | 'jpeg' | 'webp';
export type CaptureAction = 'download' | 'image-editor';

export const CAPTURE_FORMATS: ReadonlyArray<{
	value: CaptureFormat;
	label: string;
	group: 'Lossless' | 'Lossy';
	description: string;
}> = [
	{ value: 'png', label: 'PNG', group: 'Lossless', description: 'Exact pixels, best for edits' },
	{ value: 'webp', label: 'WebP', group: 'Lossy', description: 'Smaller size with strong visual quality' },
	{ value: 'jpeg', label: 'JPEG', group: 'Lossy', description: 'Compatible almost everywhere' },
];

interface CaptureMenuProps {
	format: CaptureFormat;
	onFormatChange: (f: CaptureFormat) => void;
	onAction: (action: CaptureAction) => void;
	onClose: () => void;
	anchorRef: RefObject<HTMLButtonElement | null>;
}

export function CaptureMenu({ format, onFormatChange, onAction, onClose, anchorRef }: CaptureMenuProps) {
	const menuRef = useRef<HTMLDivElement>(null);
	const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

	useLayoutEffect(() => {
		const anchor = anchorRef.current;
		if (!anchor) return;
		const rect = anchor.getBoundingClientRect();
		const menuWidth = 320;
		let left = rect.right - menuWidth;
		if (left < 8) left = 8;
		setPos({ top: rect.bottom + 8, left });
	}, [anchorRef]);

	useEffect(() => {
		const handler = (e: PointerEvent) => {
			if (!(e.target instanceof Element)) return;
			if (menuRef.current?.contains(e.target)) return;
			if (anchorRef.current?.contains(e.target)) return;
			onClose();
		};
		document.addEventListener('pointerdown', handler);
		return () => {
			document.removeEventListener('pointerdown', handler);
		};
	}, [onClose, anchorRef]);

	const groupedFormats = [
		{ label: 'Lossless', items: CAPTURE_FORMATS.filter((item) => item.group === 'Lossless') },
		{ label: 'Lossy', items: CAPTURE_FORMATS.filter((item) => item.group === 'Lossy') },
	];

	if (!pos) return null;

	return createPortal(
		<div
			ref={menuRef}
			data-capture-menu
			style={{ top: pos.top, left: pos.left }}
			className="fixed z-50 w-80 max-w-[calc(100vw-1.5rem)] overflow-hidden rounded-xl border border-border bg-surface shadow-xl animate-fade-in"
		>
			<div className="space-y-2 p-2">
				{groupedFormats.map((section) => (
					<div key={section.label} className="space-y-1">
						<p className="px-1 text-[13px] font-semibold uppercase tracking-wider text-text-tertiary">
							{section.label}
						</p>
						{section.items.map((option) => {
							const isSelected = option.value === format;
							return (
								<button
									key={option.value}
									onClick={() => {
										onFormatChange(option.value);
									}}
									className={`w-full rounded-lg border px-2.5 py-2 text-left transition-colors cursor-pointer ${
										isSelected
											? 'border-accent/35 bg-accent/10'
											: 'border-border/60 bg-surface-raised/35 hover:bg-surface-raised/60'
									}`}
								>
									<div className="flex items-center gap-2">
										<div
											className={`h-3.5 w-3.5 shrink-0 rounded-full border-[1.5px] flex items-center justify-center ${
												isSelected ? 'border-accent bg-accent' : 'border-border'
											}`}
										>
											{isSelected && <div className="h-1.5 w-1.5 rounded-full bg-white" />}
										</div>
										<div className="min-w-0">
											<p
												className={`text-[13px] font-medium ${isSelected ? 'text-text' : 'text-text-secondary'}`}
											>
												{option.label}
											</p>
											<p className="text-[13px] text-text-tertiary">{option.description}</p>
										</div>
									</div>
								</button>
							);
						})}
					</div>
				))}
			</div>

			<div className="border-t border-border p-1.5 flex gap-1.5">
				<button
					onClick={() => {
						onAction('download');
					}}
					className="flex-1 flex items-center justify-center gap-1.5 rounded-md px-3 py-2 text-[13px] font-medium bg-surface-raised/50 text-text-secondary hover:bg-surface-raised hover:text-text transition-colors cursor-pointer whitespace-nowrap"
				>
					<Download size={14} />
					Download
				</button>
				<button
					onClick={() => {
						onAction('image-editor');
					}}
					className="flex-1 flex items-center justify-center gap-1.5 rounded-md px-3 py-2 text-[13px] font-medium bg-accent/12 text-accent hover:bg-accent/20 transition-colors cursor-pointer whitespace-nowrap"
				>
					<Palette size={14} />
					Image Editor
				</button>
			</div>
		</div>,
		document.body,
	);
}
