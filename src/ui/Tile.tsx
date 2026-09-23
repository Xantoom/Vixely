import type { MediaKind } from '@/editors/registry';
import { MEDIA_ICONS } from './icons';

const SIZES = {
	sm: { box: 'size-[22px] rounded-[6px]', icon: 13 },
	md: { box: 'size-7 rounded-sm', icon: 16 },
	lg: { box: 'size-[34px] rounded-[10px]', icon: 17 },
} as const;

/** The gradient identity of a media type: its colour and its icon. */
export function Tile({
	kind,
	size = 'md',
	className = '',
}: {
	kind: MediaKind | 'batch';
	size?: keyof typeof SIZES;
	className?: string;
}) {
	const Icon = MEDIA_ICONS[kind];
	const { box, icon } = SIZES[size];
	return (
		<span
			data-media={kind}
			className={`bg-ed-gradient text-ed-ink grid flex-none place-items-center ${box} ${className}`}
			aria-hidden="true"
		>
			<Icon size={icon} strokeWidth={2.2} />
		</span>
	);
}
