import { FileImage } from 'lucide-react';
import { MetadataModal, type MetadataSection } from '@/components/MetadataModal.tsx';
import { formatDateTime, formatDimensions, formatFileSize } from '@/utils/format.ts';

interface ImageInfoModalProps {
	file: File;
	width: number;
	height: number;
	onClose: () => void;
}

export function ImageInfoModal({ file, width, height, onClose }: ImageInfoModalProps) {
	const megapixels = ((width * height) / 1_000_000).toFixed(1);
	const aspect = width > 0 && height > 0 ? `${(width / height).toFixed(2)}:1` : '—';
	const ext = file.name.split('.').pop()?.toUpperCase() ?? '—';
	const bitDepth = file.type === 'image/png' ? '8-bit RGBA' : file.type === 'image/jpeg' ? '8-bit RGB' : '—';

	const sections: MetadataSection[] = [
		{
			label: 'Overview',
			rows: [
				['Filename', file.name],
				['Format', `${ext} (${file.type || 'unknown'})`],
				['Size', formatFileSize(file.size)],
			],
		},
		{
			label: 'Dimensions',
			rows: [
				['Resolution', formatDimensions(width, height)],
				['Megapixels', `${megapixels} MP`],
				['Aspect Ratio', aspect],
				['Color Depth', bitDepth],
			],
		},
		{ label: 'File', rows: [['Last Modified', formatDateTime(file.lastModified)]] },
	];

	return <MetadataModal title="Image Info" icon={FileImage} sections={sections} onClose={onClose} />;
}
