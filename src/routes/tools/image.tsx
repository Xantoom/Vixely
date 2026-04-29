import { createFileRoute } from '@tanstack/react-router';
import { ImageIcon } from 'lucide-react';
import { useRef, useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { useShallow } from 'zustand/react/shallow';
import { ConfirmResetModal } from '@/components/ConfirmResetModal.tsx';
import { EditorEmptyState } from '@/components/editor/EditorEmptyState.tsx';
import { EditorLanding } from '@/components/editor/EditorLanding.tsx';
import { EditorShell } from '@/components/editor/EditorShell.tsx';
import { ImageCanvas } from '@/components/image/ImageCanvas.tsx';
import { ImageSidebar } from '@/components/image/ImageSidebar.tsx';
import { ImageToolbar } from '@/components/image/ImageToolbar.tsx';
import { Seo, buildWebAppSchema, buildFAQSchema } from '@/components/Seo.tsx';
import { IMAGE_ACCEPT } from '@/config/presets.ts';
import { useEditorKeyboardShortcuts } from '@/hooks/useEditorKeyboardShortcuts.ts';
import { useEditorLayoutPrefs } from '@/hooks/useEditorLayoutPrefs.ts';
import { useEditorUnsavedState } from '@/hooks/useEditorUnsavedState.ts';
import { useLongTaskObserver } from '@/hooks/useLongTaskObserver.ts';
import { usePendingActionConfirmation } from '@/hooks/usePendingActionConfirmation.ts';
import { useSingleFileDrop } from '@/hooks/useSingleFileDrop.ts';
import { useImageEditorStore } from '@/stores/imageEditor.ts';
import { consumePendingImageTransfer } from '@/utils/crossEditorTransfer.ts';
import {
	IMAGE_CROSS_LINKS,
	IMAGE_LANDING_FAQS,
	IMAGE_LANDING_FEATURES,
	IMAGE_LANDING_FORMATS,
} from './-image.landing.ts';

const ACCEPTED_IMAGE_EXTENSIONS = IMAGE_ACCEPT.split(',').map((ext) => ext.trim().toLowerCase());
const ACCEPTED_IMAGE_TYPES = new Set(
	IMAGE_ACCEPT.split(',').map((ext) => {
		const e = ext.replace('.', '');
		if (e === 'jpg' || e === 'jpeg') return 'image/jpeg';
		if (e === 'tiff') return 'image/tiff';
		return `image/${e}`;
	}),
);

function isAcceptedImageFileLike(file: File): boolean {
	if (ACCEPTED_IMAGE_TYPES.has(file.type)) return true;
	const fileName = file.name.toLowerCase();
	return ACCEPTED_IMAGE_EXTENSIONS.some((ext) => fileName.endsWith(ext));
}

export const Route = createFileRoute('/tools/image')({ component: ImageLab });

function ImageLab() {
	useEditorLayoutPrefs({ editor: 'image' });
	useLongTaskObserver('image-route');
	const { file, originalData, loadImage, undo, redo, clearAll, hasUnsavedChanges } = useImageEditorStore(
		useShallow((s) => ({
			file: s.file,
			originalData: s.originalData,
			loadImage: s.loadImage,
			undo: s.undo,
			redo: s.redo,
			clearAll: s.clearAll,
			hasUnsavedChanges: s.isDirty(),
		})),
	);
	const canvasContainerRef = useRef<HTMLDivElement>(null);
	const fileInputRef = useRef<HTMLInputElement>(null);
	const [showInfo, setShowInfo] = useState(false);
	const hasImageLoaded = originalData !== null;
	const { isConfirmOpen, requestAction, confirmPendingAction, cancelPendingAction } =
		usePendingActionConfirmation(hasUnsavedChanges);
	useEditorUnsavedState('image', hasUnsavedChanges);

	const handleNew = useCallback(() => {
		requestAction(() => {
			clearAll();
		});
	}, [clearAll, requestAction]);

	const handleLoadFile = useCallback(
		async (f: File) => {
			if (!isAcceptedImageFileLike(f)) {
				toast.error('Invalid file type', { description: 'Choose an image file (PNG, JPG, WebP, etc.)' });
				return;
			}

			let bitmap: ImageBitmap | null = null;
			try {
				try {
					bitmap = await createImageBitmap(f, { imageOrientation: 'from-image' });
				} catch {
					bitmap = await createImageBitmap(f);
				}

				const tmp = document.createElement('canvas');
				tmp.width = bitmap.width;
				tmp.height = bitmap.height;
				const ctx = tmp.getContext('2d', { willReadFrequently: true });
				if (!ctx) throw new Error('Canvas context unavailable');

				ctx.drawImage(bitmap, 0, 0);
				const imageData = ctx.getImageData(0, 0, bitmap.width, bitmap.height);
				loadImage(f, imageData);
				toast.success('Image loaded', { description: `${bitmap.width} × ${bitmap.height}` });
			} catch {
				toast.error('Failed to load image');
			} finally {
				bitmap?.close();
			}
		},
		[loadImage],
	);

	const { isDragging, dropHandlers } = useSingleFileDrop<HTMLDivElement>({
		onFile: (file) => {
			void handleLoadFile(file);
		},
		acceptFile: isAcceptedImageFileLike,
		onRejectedFile: () => {
			toast.error('Invalid file type', { description: 'Drop an image file (PNG, JPG, WebP, etc.)' });
		},
	});

	const handleOpenFile = useCallback(() => {
		fileInputRef.current?.click();
	}, []);

	useEffect(() => {
		const transferredFile = consumePendingImageTransfer();
		if (!transferredFile) return;
		void handleLoadFile(transferredFile);
	}, [handleLoadFile]);

	useEditorKeyboardShortcuts({ onUndo: undo, onRedo: redo });

	return (
		<>
			<Seo
				title="Free Online Image Editor — Resize, Crop & Filter"
				description="Free online image editor — resize, crop, apply real-time filters, color-correct and export PNG, JPG, WebP, AVIF directly in your browser. No upload, 100% private."
				path="/tools/image"
				jsonLd={[
					buildWebAppSchema(
						'Vixely Image Editor',
						'Resize, crop, apply real-time filters and export PNG, JPG, WebP, AVIF directly in your browser. No upload, 100% private, powered by native Canvas and WebGL2.',
						'https://vixely.app/tools/image',
					),
					buildFAQSchema(IMAGE_LANDING_FAQS.map((f) => ({ question: f.question, answer: f.answer }))),
				]}
			/>
			{hasImageLoaded && <h1 className="sr-only">Image Editor</h1>}

			<input
				ref={fileInputRef}
				type="file"
				accept={IMAGE_ACCEPT}
				className="hidden"
				onChange={(e) => {
					const f = e.target.files?.[0];
					if (f) void handleLoadFile(f);
					e.currentTarget.value = '';
				}}
			/>

			<EditorShell
				editor="image"
				hasFile={hasImageLoaded}
				sidebarLabel="image inspector"
				main={
					<>
						{hasImageLoaded && (
							<ImageToolbar
								containerRef={canvasContainerRef}
								fileName={file?.name}
								onOpenFile={handleOpenFile}
								onNew={handleNew}
								onShowInfo={() => {
									setShowInfo(true);
								}}
							/>
						)}
						{hasImageLoaded ? (
							<div
								ref={canvasContainerRef}
								className={`flex-1 relative overflow-hidden checkerboard ${isDragging ? 'drop-zone-active' : ''}`}
								{...dropHandlers}
							>
								<ImageCanvas containerRef={canvasContainerRef} />

								{isDragging && (
									<div className="absolute inset-0 flex items-center justify-center bg-accent-surface/50 backdrop-blur-sm z-20 pointer-events-none">
										<div className="rounded-xl border-2 border-dashed border-accent px-6 py-4 text-sm font-medium text-accent">
											Drop to replace image
										</div>
									</div>
								)}
							</div>
						) : (
							<EditorLanding
								emptyState={
									<EditorEmptyState
										icon={ImageIcon}
										variant="hero"
										isDragging={isDragging}
										title="No image loaded"
										description="Drop an image or click to get started"
										dragTitle="Drop your image here"
										dragDescription="Release to load"
										onChooseFile={handleOpenFile}
										formatHints={['PNG', 'JPG', 'WebP', 'AVIF', 'BMP']}
									/>
								}
								dropHandlers={dropHandlers}
								isDragging={isDragging}
								hasFile={false}
								replaceLabel="Drop your image here"
								heading="Free Online Image Editor — Resize, Crop & Filter in Browser"
								tagline="Resize, crop, adjust colors and export PNG, JPG, WebP, AVIF instantly. No upload required — your files stay on your device."
								features={[...IMAGE_LANDING_FEATURES]}
								formats={IMAGE_LANDING_FORMATS}
								formatColor="bg-amber-400"
								faqs={[...IMAGE_LANDING_FAQS]}
								crossLinks={[...IMAGE_CROSS_LINKS]}
								poweredBy="Canvas & WebGL2"
							/>
						)}
					</>
				}
				sidebar={
					hasImageLoaded ? <ImageSidebar showInfo={showInfo} onShowInfoChange={setShowInfo} /> : undefined
				}
				overlays={
					isConfirmOpen ? (
						<ConfirmResetModal onConfirm={confirmPendingAction} onCancel={cancelPendingAction} />
					) : undefined
				}
			/>
		</>
	);
}
