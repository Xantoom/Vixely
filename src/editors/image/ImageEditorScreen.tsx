import { useEffect, useRef, useState } from 'react';
import { useLeaveGuard } from '@/app/leave-guard';
import { EditorLayout } from '@/editor/EditorLayout';
import { FilePanel, ToolLater } from '@/editor/Inspector';
import { StickersPanel, TextPanel } from '@/editor/overlays/panels';
import { useEditorShortcuts } from '@/editor/shortcuts';
import { Viewer } from '@/editor/Viewer';
import { ZoomStatus } from '@/editor/ZoomStage';
import type { ToolId } from '@/editors/registry';
import { useSession } from '@/media/session';
import type { ItemStatus } from './batch-export';
import { BatchStrip } from './BatchStrip';
import type { Size } from './document';
import { overlayEditing, useImagePictureEditing } from './editing';
import { outputSize, sourceExportSettings } from './export';
import { ExportFooter } from './ExportFooter';
import { ImageViewer } from './ImageViewer';
import { AdjustPanel, CropPanel, ExportPanel } from './panels';
import { PresetsPanel } from './PresetsPanel';
import { useImageDoc, useImageEditor, useUndoState } from './store';

export function ImageEditorScreen({ initialTool }: { initialTool?: ToolId }) {
	const current = useSession((state) => state.current);
	// A batch of audio files belongs to the audio editor.
	const batch = useSession((state) => (state.batchKind === 'image' ? state.batch : null));
	const batchKey = useSession((state) => (state.batchKind === 'image' ? state.batchKey : null));
	const opened = current?.kind === 'image' ? current : null;
	const source = opened?.poster ?? null;
	const load = useImageEditor((state) => state.load);
	const retarget = useImageEditor((state) => state.retarget);
	const adoptSource = useImageEditor((state) => state.adoptSource);
	const undo = useImageEditor((state) => state.undo);
	const redo = useImageEditor((state) => state.redo);
	const { canUndo, canRedo } = useUndoState();
	// Edits not exported yet: closing the tab asks first.
	useLeaveGuard(canUndo);
	const [tool, setTool] = useState<ToolId>(initialTool ?? 'info');
	const [statuses, setStatuses] = useState<ReadonlyMap<number, ItemStatus>>(new Map());
	const [running, setRunning] = useState(false);
	const shownSize = useRef<Size | null>(null);
	const textRef = useRef<HTMLTextAreaElement>(null);

	// A batch keeps one set of edits across its images; a single file has its own.
	useEffect(() => {
		const owner = batchKey ?? opened?.file;
		if (!owner || !opened) return;
		load(owner);
		// The export starts from the file's own format and quality; a batch, from its first image.
		const { file, format } = opened;
		void sourceExportSettings(file, format).then((settings) => {
			adoptSource(owner, settings);
		});
	}, [batchKey, opened, load, adoptSource]);

	// Switching images within a batch adapts the edits to the new image's size.
	useEffect(() => {
		if (!source) return;
		const previous = shownSize.current;
		const next = { width: source.width, height: source.height };
		if (batchKey && previous && (previous.width !== next.width || previous.height !== next.height)) {
			retarget(previous, next);
		}
		shownSize.current = next;
	}, [source, batchKey, retarget]);

	useEditorShortcuts({ undo, redo });
	const doc = useImageDoc();
	const exportSettings = useImageEditor((state) => state.exportSettings);
	// The status bar shows what the export will make.
	const cropped = source ? outputSize(doc, source, exportSettings) : null;
	const editing = useImagePictureEditing({ width: source?.width ?? 1, height: source?.height ?? 1 }, source);

	const inspector = () => {
		if (tool === 'info' || !opened) return <FilePanel opened={opened} />;
		if (!source) return <ToolLater kind="image" tool={tool} />;
		if (tool === 'crop') return <CropPanel editing={editing} />;
		if (tool === 'adjust') return <AdjustPanel editing={editing} />;
		if (tool === 'presets') return <PresetsPanel editing={editing} />;
		if (tool === 'text') return <TextPanel editing={overlayEditing(editing)} textRef={textRef} />;
		if (tool === 'stickers') return <StickersPanel editing={overlayEditing(editing)} />;
		if (tool === 'export') return <ExportPanel source={source} photo={opened.info?.photo ?? null} />;
		return <ToolLater kind="image" tool={tool} />;
	};

	return (
		<EditorLayout
			kind="image"
			fileName={batch ? undefined : opened?.file.name}
			tool={tool}
			onTool={setTool}
			actions={{
				canUndo,
				canRedo,
				onUndo: undo,
				onRedo: redo,
				onExport: source
					? () => {
							setTool('export');
						}
					: undefined,
				exportActive: tool === 'export',
			}}
			viewer={
				source ? (
					<ImageViewer
						source={source}
						cropping={tool === 'crop'}
						overlays={tool === 'text' || tool === 'stickers' ? overlayEditing(editing) : undefined}
						onEditText={() => {
							setTool('text');
							requestAnimationFrame(() => {
								textRef.current?.focus();
							});
						}}
					/>
				) : (
					<Viewer kind="image" opened={opened} />
				)
			}
			status={source ? <ZoomStatus size={cropped} /> : undefined}
			timeline={batch ? <BatchStrip statuses={statuses} locked={running} /> : undefined}
			inspector={inspector()}
			inspectorFooter={
				tool === 'export' && source && opened ? (
					<ExportFooter
						source={source}
						file={opened.file}
						photo={opened.info?.photo ?? null}
						batch={batch}
						onRunning={setRunning}
						onStatus={(id, status) => {
							setStatuses((previous) => {
								const next = new Map(previous);
								if (status) next.set(id, status);
								else next.delete(id);
								return next;
							});
						}}
					/>
				) : undefined
			}
		/>
	);
}
