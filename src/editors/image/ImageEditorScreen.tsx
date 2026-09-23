import { useEffect, useRef, useState } from 'react';
import { EditorLayout } from '@/editor/EditorLayout';
import { FilePanel, ToolLater } from '@/editor/Inspector';
import { useEditorShortcuts } from '@/editor/shortcuts';
import { Viewer } from '@/editor/Viewer';
import type { ToolId } from '@/editors/registry';
import { useSession } from '@/media/session';
import type { ItemStatus } from './batch-export';
import { BatchStrip } from './BatchStrip';
import type { Size } from './document';
import { ExportFooter } from './ExportFooter';
import { ImageViewer } from './ImageViewer';
import { AdjustPanel, CropPanel, ExportPanel } from './panels';
import { useImageEditor, useUndoState } from './store';

export function ImageEditorScreen({ initialTool }: { initialTool?: ToolId }) {
	const current = useSession((state) => state.current);
	const batch = useSession((state) => state.batch);
	const batchKey = useSession((state) => state.batchKey);
	const opened = current?.kind === 'image' ? current : null;
	const source = opened?.poster ?? null;
	const load = useImageEditor((state) => state.load);
	const retarget = useImageEditor((state) => state.retarget);
	const undo = useImageEditor((state) => state.undo);
	const redo = useImageEditor((state) => state.redo);
	const { canUndo, canRedo } = useUndoState();
	const [tool, setTool] = useState<ToolId>(initialTool ?? 'info');
	const [statuses, setStatuses] = useState<ReadonlyMap<number, ItemStatus>>(new Map());
	const [running, setRunning] = useState(false);
	const shownSize = useRef<Size | null>(null);

	// A batch keeps one set of edits across its images; a single file has its own.
	useEffect(() => {
		const owner = batchKey ?? opened?.file;
		if (owner) load(owner);
	}, [batchKey, opened?.file, load]);

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

	const inspector = () => {
		if (tool === 'info' || !opened) return <FilePanel opened={opened} />;
		if (!source) return <ToolLater kind="image" tool={tool} />;
		if (tool === 'crop') return <CropPanel source={source} />;
		if (tool === 'adjust') return <AdjustPanel />;
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
					<ImageViewer source={source} cropping={tool === 'crop'} />
				) : (
					<Viewer kind="image" opened={opened} />
				)
			}
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
