import { useEffect, useState } from 'react';
import { EditorLayout } from '@/editor/EditorLayout';
import { FilePanel, ToolLater } from '@/editor/Inspector';
import { useEditorShortcuts } from '@/editor/shortcuts';
import { Viewer } from '@/editor/Viewer';
import type { ToolId } from '@/editors/registry';
import { useSession } from '@/media/session';
import { ExportFooter } from './ExportFooter';
import { ImageViewer } from './ImageViewer';
import { AdjustPanel, CropPanel, ExportPanel } from './panels';
import { useImageEditor, useUndoState } from './store';

export function ImageEditorScreen({ initialTool }: { initialTool?: ToolId }) {
	const current = useSession((state) => state.current);
	const opened = current?.kind === 'image' ? current : null;
	const source = opened?.poster ?? null;
	const load = useImageEditor((state) => state.load);
	const undo = useImageEditor((state) => state.undo);
	const redo = useImageEditor((state) => state.redo);
	const { canUndo, canRedo } = useUndoState();
	const [tool, setTool] = useState<ToolId>(initialTool ?? 'info');

	useEffect(() => {
		if (opened) load(opened.file);
	}, [opened, load]);

	useEditorShortcuts({ undo, redo });

	const inspector = () => {
		if (tool === 'info' || !opened) return <FilePanel opened={opened} />;
		if (!source) return <ToolLater kind="image" tool={tool} />;
		if (tool === 'crop') return <CropPanel source={source} />;
		if (tool === 'adjust') return <AdjustPanel />;
		if (tool === 'export') return <ExportPanel source={source} />;
		return <ToolLater kind="image" tool={tool} />;
	};

	return (
		<EditorLayout
			kind="image"
			fileName={opened?.file.name}
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
			inspector={inspector()}
			inspectorFooter={
				tool === 'export' && source && opened ? <ExportFooter source={source} file={opened.file} /> : undefined
			}
		/>
	);
}
