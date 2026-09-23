import { Check } from 'lucide-react';
import { useEffect, useState } from 'react';
import { m } from '@/paraglide/messages.js';
import { Button } from '@/ui/Button';
import { exportImage, exportName, saveFile } from './export';
import { useImageDoc, useImageEditor } from './store';

/** How long the button confirms a save before going back to its normal label. */
const SAVED_FEEDBACK = 2500;

export function ExportFooter({ source, file }: { source: ImageBitmap; file: File }) {
	const doc = useImageDoc();
	const settings = useImageEditor((state) => state.exportSettings);
	const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'failed'>('idle');

	useEffect(() => {
		if (status !== 'saved') return;
		const timer = setTimeout(() => {
			setStatus('idle');
		}, SAVED_FEEDBACK);
		return () => {
			clearTimeout(timer);
		};
	}, [status]);

	const save = async () => {
		setStatus('saving');
		try {
			const blob = await exportImage(source, doc, settings);
			setStatus((await saveFile(blob, exportName(file.name, settings.format))) ? 'saved' : 'idle');
		} catch {
			setStatus('failed');
		}
	};

	return (
		<>
			<Button
				variant="primary"
				className="h-11 w-full"
				onClick={() => void save()}
				disabled={status === 'saving'}
			>
				{status === 'saved' ? (
					<>
						<Check size={17} strokeWidth={2.4} aria-hidden="true" />
						{m.saved()}
					</>
				) : status === 'saving' ? (
					m.exporting()
				) : (
					m.export_image_button()
				)}
			</Button>
			{status === 'failed' && (
				<p role="alert" className="text-small text-danger">
					{m.export_failed()}
				</p>
			)}
		</>
	);
}
