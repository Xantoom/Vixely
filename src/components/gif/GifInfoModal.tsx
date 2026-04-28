import { Film } from 'lucide-react';
import { MetadataModal, type MetadataSection } from '@/components/MetadataModal.tsx';
import { formatDateTime, formatDimensions, formatFileSize } from '@/utils/format.ts';

interface GifInfoModalProps {
	file: File;
	width: number | null;
	height: number | null;
	duration: number;
	fps: number;
	frameCount?: number;
	isGifSource: boolean;
	onClose: () => void;
}

export function GifInfoModal({
	file,
	width,
	height,
	duration,
	fps,
	frameCount,
	isGifSource,
	onClose,
}: GifInfoModalProps) {
	const estimatedFrames = frameCount ?? Math.ceil(duration * fps);
	const ext = file.name.split('.').pop()?.toUpperCase() ?? '—';

	const sections: MetadataSection[] = [
		{
			label: 'Overview',
			rows: [
				['Filename', file.name],
				['Source Type', isGifSource ? 'GIF' : `Video (${ext})`],
				['Size', formatFileSize(file.size)],
			],
		},
		{
			label: 'Dimensions',
			rows: [
				['Resolution', width != null && height != null ? formatDimensions(width, height) : '—'],
				[
					'Aspect Ratio',
					width != null && height != null && width > 0 && height > 0
						? `${(width / height).toFixed(2)}:1`
						: '—',
				],
			],
		},
		{
			label: 'Timing',
			rows: [
				['Duration', `${duration.toFixed(2)}s`],
				['Frame Rate', `${fps} fps`],
				['Frames', `${estimatedFrames}`],
			],
		},
		{
			label: 'File',
			rows: [
				['MIME Type', file.type || 'unknown'],
				['Last Modified', formatDateTime(file.lastModified)],
			],
		},
	];

	return <MetadataModal title="GIF Info" icon={Film} sections={sections} onClose={onClose} />;
}
