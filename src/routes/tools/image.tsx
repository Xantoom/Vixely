import { createFileRoute } from '@tanstack/react-router';
import { ImageIcon, Settings } from 'lucide-react';
import { useRef, useEffect, useState, useCallback } from 'react';
import { Helmet } from 'react-helmet-async';
import { toast } from 'sonner';
import { ConfirmResetModal } from '@/components/ConfirmResetModal.tsx';
import { ImageCanvas } from '@/components/image/ImageCanvas.tsx';
import { ImageSidebar } from '@/components/image/ImageSidebar.tsx';
import { ImageToolbar } from '@/components/image/ImageToolbar.tsx';
import { Drawer } from '@/components/ui/Drawer.tsx';
import { Button } from '@/components/ui/index.ts';
import { IMAGE_ACCEPT } from '@/config/presets.ts';
import { useImageEditorStore } from '@/stores/imageEditor.ts';
import { consumePendingImageTransfer } from '@/utils/crossEditorTransfer.ts';

const ACCEPTED_TYPES = new Set(
	IMAGE_ACCEPT.split(',').map((ext) => {
		const e = ext.replace('.', '');
		if (e === 'jpg' || e === 'jpeg') return 'image/jpeg';
		if (e === 'tiff') return 'image/tiff';
		return `image/${e}`;
	}),
);

export const Route = createFileRoute('/tools/image')({ component: ImageLab });

function ImageLab() {
	const originalData = useImageEditorStore((s) => s.originalData);
	const loadImage = useImageEditorStore((s) => s.loadImage);
	const undo = useImageEditorStore((s) => s.undo);
	const redo = useImageEditorStore((s) => s.redo);
	const clearAll = useImageEditorStore((s) => s.clearAll);
	const isDirty = useImageEditorStore((s) => s.isDirty);

	const canvasContainerRef = useRef<HTMLDivElement>(null);
	const fileInputRef = useRef<HTMLInputElement>(null);
	const [isDragging, setIsDragging] = useState(false);
	const dragCounter = useRef(0);
	const [showResetModal, setShowResetModal] = useState(false);
	const [drawerOpen, setDrawerOpen] = useState(false);
	const [pendingAction, setPendingAction] = useState<(() => void) | null>(null);

	useEffect(() => {
		if (!isDirty()) return;
		const handler = (e: BeforeUnloadEvent) => {
			e.preventDefault();
		};
		window.addEventListener('beforeunload', handler);
		return () => {
			window.removeEventListener('beforeunload', handler);
		};
	});

	const confirmAction = useCallback(
		(action: () => void) => {
			if (isDirty()) {
				setPendingAction(() => action);
				setShowResetModal(true);
			} else {
				action();
			}
		},
		[isDirty],
	);

	const handleConfirmReset = useCallback(() => {
		setShowResetModal(false);
		pendingAction?.();
		setPendingAction(null);
	}, [pendingAction]);

	const handleCancelReset = useCallback(() => {
		setShowResetModal(false);
		setPendingAction(null);
	}, []);

	const handleNew = useCallback(() => {
		confirmAction(() => {
			clearAll();
		});
	}, [clearAll, confirmAction]);

	const handleLoadFile = useCallback(
		(f: File) => {
			const img = new Image();
			img.onload = () => {
				const tmp = document.createElement('canvas');
				tmp.width = img.width;
				tmp.height = img.height;
				const ctx = tmp.getContext('2d', { willReadFrequently: true })!;
				ctx.drawImage(img, 0, 0);
				const imageData = ctx.getImageData(0, 0, img.width, img.height);
				loadImage(f, imageData);
				URL.revokeObjectURL(img.src);
				toast.success('Image loaded', { description: `${img.width} \u00d7 ${img.height}` });
			};
			img.src = URL.createObjectURL(f);
		},
		[loadImage],
	);

	const handleOpenFile = useCallback(() => {
		fileInputRef.current?.click();
	}, []);

	useEffect(() => {
		const transferredFile = consumePendingImageTransfer();
		if (!transferredFile) return;
		handleLoadFile(transferredFile);
	}, [handleLoadFile]);

	const handleDragEnter = useCallback((e: React.DragEvent) => {
		e.preventDefault();
		e.stopPropagation();
		dragCounter.current++;
		if (dragCounter.current === 1) setIsDragging(true);
	}, []);

	const handleDragLeave = useCallback((e: React.DragEvent) => {
		e.preventDefault();
		e.stopPropagation();
		dragCounter.current--;
		if (dragCounter.current === 0) setIsDragging(false);
	}, []);

	const handleDragOver = useCallback((e: React.DragEvent) => {
		e.preventDefault();
		e.stopPropagation();
	}, []);

	const handleDrop = useCallback(
		(e: React.DragEvent) => {
			e.preventDefault();
			e.stopPropagation();
			dragCounter.current = 0;
			setIsDragging(false);

			const file = e.dataTransfer.files[0];
			if (!file) return;

			if (!file.type.startsWith('image/') && !ACCEPTED_TYPES.has(file.type)) {
				toast.error('Invalid file type', { description: 'Drop an image file (PNG, JPG, WebP, etc.)' });
				return;
			}

			handleLoadFile(file);
		},
		[handleLoadFile],
	);

	useEffect(() => {
		const onKeyDown = (e: KeyboardEvent) => {
			if (e.target instanceof HTMLInputElement) return;

			const mod = e.ctrlKey || e.metaKey;
			if (mod && e.key === 'z' && !e.shiftKey) {
				e.preventDefault();
				undo();
			} else if (mod && e.key === 'z' && e.shiftKey) {
				e.preventDefault();
				redo();
			} else if (mod && e.key === 'y') {
				e.preventDefault();
				redo();
			}
		};

		window.addEventListener('keydown', onKeyDown);
		return () => {
			window.removeEventListener('keydown', onKeyDown);
		};
	}, [undo, redo]);

	return (
		<div data-editor="image" className="h-full flex flex-col">
			<Helmet>
				<title>Image — Vixely</title>
				<meta
					name="description"
					content="Apply real-time image filters. Brightness, contrast, saturation — all client-side."
				/>
			</Helmet>

			<input
				ref={fileInputRef}
				type="file"
				accept={IMAGE_ACCEPT}
				className="hidden"
				onChange={(e) => {
					const f = e.target.files?.[0];
					if (f) handleLoadFile(f);
				}}
			/>

			<div className="h-[2px] gradient-accent shrink-0" />
			<div className="flex flex-1 min-h-0 animate-fade-in">
				<div className="flex-1 flex flex-col min-w-0">
					<ImageToolbar containerRef={canvasContainerRef} />
					<div
						ref={canvasContainerRef}
						className={`flex-1 relative overflow-hidden checkerboard ${isDragging ? 'drop-zone-active' : ''}`}
						onDragEnter={handleDragEnter}
						onDragLeave={handleDragLeave}
						onDragOver={handleDragOver}
						onDrop={handleDrop}
					>
						{originalData ? (
							<ImageCanvas containerRef={canvasContainerRef} />
						) : (
							<div className="flex-1 flex flex-col items-center justify-center h-full gap-6">
								<EmptyState isDragging={isDragging} onOpenFile={handleOpenFile} />
							</div>
						)}

						{isDragging && originalData && (
							<div className="absolute inset-0 flex items-center justify-center bg-accent-surface/50 backdrop-blur-sm z-20 pointer-events-none">
								<div className="rounded-xl border-2 border-dashed border-accent px-6 py-4 text-sm font-medium text-accent">
									Drop to replace image
								</div>
							</div>
						)}
					</div>
				</div>

				<button
					className="md:hidden fixed bottom-20 right-4 z-30 h-12 w-12 rounded-full gradient-accent flex items-center justify-center shadow-lg cursor-pointer"
					onClick={() => {
						setDrawerOpen(true);
					}}
				>
					<Settings size={20} className="text-white" />
				</button>

				<div className="hidden md:flex">
					<ImageSidebar onOpenFile={handleOpenFile} onNew={handleNew} />
				</div>

				<Drawer
					open={drawerOpen}
					onClose={() => {
						setDrawerOpen(false);
					}}
				>
					<ImageSidebar onOpenFile={handleOpenFile} onNew={handleNew} />
				</Drawer>
			</div>
			{showResetModal && <ConfirmResetModal onConfirm={handleConfirmReset} onCancel={handleCancelReset} />}
		</div>
	);
}

function EmptyState({ isDragging, onOpenFile }: { isDragging: boolean; onOpenFile: () => void }) {
	return (
		<div className="flex flex-col items-center text-center">
			<div
				className={`rounded-2xl bg-surface border border-border p-8 mb-5 transition-all ${isDragging ? 'border-accent scale-105 shadow-[0_0_40px_var(--color-accent-glow)]' : ''}`}
			>
				<ImageIcon
					size={48}
					strokeWidth={1.2}
					className={`transition-colors ${isDragging ? 'text-accent' : 'text-accent/25'}`}
				/>
			</div>
			<p className="text-sm font-medium text-text-secondary">
				{isDragging ? 'Drop your image here' : 'No image loaded'}
			</p>
			<p className="mt-1 text-[14px] text-text-tertiary">
				{isDragging ? 'Release to load' : 'Drop a file or click to get started'}
			</p>
			{!isDragging && (
				<Button variant="secondary" size="sm" className="mt-4" onClick={onOpenFile}>
					Choose File
				</Button>
			)}
		</div>
	);
}
