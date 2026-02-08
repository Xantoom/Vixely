import { useRef, useEffect, useState, useCallback } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Helmet } from "react-helmet-async";
import { toast } from "sonner";
import { ImageIcon, Settings } from "lucide-react";
import { Button } from "@/components/ui/index.ts";
import { useImageProcessor } from "@/hooks/useImageProcessor.ts";
import { useImageEditorStore } from "@/stores/imageEditor.ts";
import { ImageCanvas } from "@/components/image/ImageCanvas.tsx";
import { ImageToolbar } from "@/components/image/ImageToolbar.tsx";
import { ImageSidebar } from "@/components/image/ImageSidebar.tsx";
import { IMAGE_ACCEPT } from "@/config/presets.ts";
import { ConfirmResetModal } from "@/components/ConfirmResetModal.tsx";
import { Drawer } from "@/components/ui/Drawer.tsx";

const ACCEPTED_TYPES = new Set(
	IMAGE_ACCEPT.split(",").map((ext) => {
		const e = ext.replace(".", "");
		if (e === "jpg" || e === "jpeg") return "image/jpeg";
		if (e === "tiff") return "image/tiff";
		return `image/${e}`;
	}),
);

export const Route = createFileRoute("/tools/image")({
	component: ImageLab,
});

function ImageLab() {
	const { ready, processImageData } = useImageProcessor();
	const { originalData, loadImage, undo, redo, clearAll } = useImageEditorStore();

	const canvasContainerRef = useRef<HTMLDivElement>(null);
	const fileInputRef = useRef<HTMLInputElement>(null);
	const [isDragging, setIsDragging] = useState(false);
	const dragCounter = useRef(0);
	const [showResetModal, setShowResetModal] = useState(false);
	const [drawerOpen, setDrawerOpen] = useState(false);
	const [pendingAction, setPendingAction] = useState<(() => void) | null>(null);

	const { isDirty } = useImageEditorStore();

	// beforeunload warning when image is loaded
	useEffect(() => {
		if (!isDirty()) return;
		const handler = (e: BeforeUnloadEvent) => {
			e.preventDefault();
		};
		window.addEventListener("beforeunload", handler);
		return () => window.removeEventListener("beforeunload", handler);
	});

	const confirmAction = useCallback((action: () => void) => {
		if (isDirty()) {
			setPendingAction(() => action);
			setShowResetModal(true);
		} else {
			action();
		}
	}, [isDirty]);

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
		const { clearAll } = useImageEditorStore.getState();
		confirmAction(() => clearAll());
	}, [confirmAction]);

	const handleLoadFile = useCallback((f: File) => {
		const img = new Image();
		img.onload = () => {
			const tmp = document.createElement("canvas");
			tmp.width = img.width;
			tmp.height = img.height;
			const ctx = tmp.getContext("2d", { willReadFrequently: true })!;
			ctx.drawImage(img, 0, 0);
			const imageData = ctx.getImageData(0, 0, img.width, img.height);
			loadImage(f, imageData);
			URL.revokeObjectURL(img.src);
			toast.success("Image loaded", { description: `${img.width} \u00d7 ${img.height}` });
		};
		img.src = URL.createObjectURL(f);
	}, [loadImage]);

	const handleOpenFile = useCallback(() => {
		fileInputRef.current?.click();
	}, []);

	/* ── Drag-and-drop handlers ── */
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

	const handleDrop = useCallback((e: React.DragEvent) => {
		e.preventDefault();
		e.stopPropagation();
		dragCounter.current = 0;
		setIsDragging(false);

		const file = e.dataTransfer.files[0];
		if (!file) return;

		if (!file.type.startsWith("image/") && !ACCEPTED_TYPES.has(file.type)) {
			toast.error("Invalid file type", { description: "Drop an image file (PNG, JPG, WebP, etc.)" });
			return;
		}

		handleLoadFile(file);
	}, [handleLoadFile]);

	/* ── Keyboard shortcuts ── */
	useEffect(() => {
		const onKeyDown = (e: KeyboardEvent) => {
			if (e.target instanceof HTMLInputElement) return;

			const mod = e.ctrlKey || e.metaKey;
			if (mod && e.key === "z" && !e.shiftKey) {
				e.preventDefault();
				undo(processImageData);
			} else if (mod && e.key === "z" && e.shiftKey) {
				e.preventDefault();
				redo(processImageData);
			} else if (mod && e.key === "y") {
				e.preventDefault();
				redo(processImageData);
			}
		};

		window.addEventListener("keydown", onKeyDown);
		return () => window.removeEventListener("keydown", onKeyDown);
	}, [undo, redo, processImageData]);

	return (
		<>
			<Helmet>
				<title>Image — Vixely</title>
				<meta name="description" content="Apply real-time image filters. Brightness, contrast, saturation — all client-side." />
			</Helmet>

			{/* Shared file input */}
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

			<div className="flex h-full animate-fade-in">
				{/* ── Left panel: Toolbar + Canvas ── */}
				<div className="flex-1 flex flex-col min-w-0">
					<ImageToolbar processFn={processImageData} containerRef={canvasContainerRef} />
					<div
						ref={canvasContainerRef}
						className={`flex-1 relative overflow-hidden checkerboard ${isDragging ? "drop-zone-active" : ""}`}
						onDragEnter={handleDragEnter}
						onDragLeave={handleDragLeave}
						onDragOver={handleDragOver}
						onDrop={handleDrop}
					>
						{originalData ? (
							<ImageCanvas containerRef={canvasContainerRef} />
						) : (
							<div className="flex-1 flex items-center justify-center h-full">
								<EmptyState isDragging={isDragging} onOpenFile={handleOpenFile} />
							</div>
						)}

						{/* Drag overlay when image is loaded */}
						{isDragging && originalData && (
							<div className="absolute inset-0 flex items-center justify-center bg-accent-surface/50 backdrop-blur-sm z-20 pointer-events-none">
								<div className="rounded-xl border-2 border-dashed border-accent px-6 py-4 text-sm font-medium text-accent">
									Drop to replace image
								</div>
							</div>
						)}
					</div>
				</div>

				{/* ── Mobile Sidebar Toggle ── */}
				<button
					className="md:hidden fixed bottom-20 right-4 z-30 h-12 w-12 rounded-full gradient-accent flex items-center justify-center shadow-lg cursor-pointer"
					onClick={() => setDrawerOpen(true)}
				>
					<Settings size={20} className="text-white" />
				</button>

				{/* ── Right sidebar (Desktop) ── */}
				<div className="hidden md:flex">
					<ImageSidebar processFn={processImageData} wasmReady={ready} onOpenFile={handleOpenFile} onNew={handleNew} />
				</div>

				{/* ── Mobile Sidebar Drawer ── */}
				<Drawer open={drawerOpen} onClose={() => setDrawerOpen(false)}>
					<ImageSidebar processFn={processImageData} wasmReady={ready} onOpenFile={handleOpenFile} onNew={handleNew} />
				</Drawer>
			</div>
			{/* Confirm reset modal */}
			{showResetModal && (
				<ConfirmResetModal
					onConfirm={handleConfirmReset}
					onCancel={handleCancelReset}
				/>
			)}
		</>
	);
}

function EmptyState({ isDragging, onOpenFile }: { isDragging: boolean; onOpenFile: () => void }) {
	return (
		<div
			className="flex flex-col items-center text-center"
			onClick={(e) => e.stopPropagation()}
		>
			<div className={`rounded-2xl bg-surface border border-border p-8 mb-5 transition-all ${isDragging ? "border-accent scale-105" : ""}`}>
				<ImageIcon
					size={48}
					strokeWidth={1.2}
					className={`transition-colors ${isDragging ? "text-accent" : "text-text-tertiary/40"}`}
				/>
			</div>
			<p className="text-sm font-medium text-text-secondary">
				{isDragging ? "Drop your image here" : "No image loaded"}
			</p>
			<p className="mt-1 text-xs text-text-tertiary">
				{isDragging ? "Release to load" : "Click or drag & drop to start editing"}
			</p>
			{!isDragging && (
				<Button
					variant="secondary"
					size="sm"
					className="mt-4"
					onClick={onOpenFile}
				>
					Choose File
				</Button>
			)}
		</div>
	);
}
