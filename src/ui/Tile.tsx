import type { MediaKind } from '@/editors/registry';
import { MEDIA_ICONS } from './icons';

const SIZES = {
	sm: { box: 'size-7 rounded-[0.45rem]', icon: 'size-4' },
	md: { box: 'size-8 rounded-[0.55rem]', icon: 'size-[1.1rem]' },
	lg: { box: 'size-9 rounded-[0.6rem]', icon: 'size-5' },
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
			<Icon className={icon} strokeWidth={2} />
		</span>
	);
}
