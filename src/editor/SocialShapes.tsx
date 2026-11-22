import { useState } from 'react';
import type { FixedAspect } from '@/editors/image/store';
import { m } from '@/paraglide/messages.js';
import { BrandLogo, type LogoId } from '@/ui/BrandLogo';
import { SearchField, searchable } from '@/ui/SearchField';

export interface SocialShape {
	id: string;
	/** The platform, and what the shape is for on it. */
	name: () => string;
	aspect: FixedAspect;
	/** The size the platform recommends, in pixels. */
	width: number;
	height: number;
}

interface Network {
	id: string;
	name: string;
	logo: LogoId;
	formats: { id: string; label: () => string; aspect: FixedAspect; width: number; height: number }[];
}

const VERTICAL = { aspect: '9:16', width: 1080, height: 1920 } as const;
const PORTRAIT = { aspect: '4:5', width: 1080, height: 1350 } as const;
const SQUARE = { aspect: '1:1', width: 1080, height: 1080 } as const;
const WIDE = { aspect: '16:9', width: 1920, height: 1080 } as const;

/** Each network with the shapes it shows, as it recommends them, most used first. */
const NETWORKS: Network[] = [
	{
		id: 'instagram',
		name: 'Instagram',
		logo: 'instagram',
		formats: [
			{ id: 'reels', label: () => m.social_reels(), ...VERTICAL },
			{ id: 'post', label: () => m.social_post(), ...PORTRAIT },
			{ id: 'square', label: () => m.social_square(), ...SQUARE },
		],
	},
	{
		id: 'tiktok',
		name: 'TikTok',
		logo: 'tiktok',
		formats: [{ id: 'video', label: () => m.social_video(), ...VERTICAL }],
	},
	{
		id: 'youtube',
		name: 'YouTube',
		logo: 'youtube',
		formats: [
			{ id: 'video', label: () => m.social_video(), ...WIDE },
			{ id: 'shorts', label: () => 'Shorts', ...VERTICAL },
		],
	},
	{
		id: 'facebook',
		name: 'Facebook',
		logo: 'facebook',
		formats: [
			{ id: 'post', label: () => m.social_post(), ...PORTRAIT },
			{ id: 'reels', label: () => m.social_reels(), ...VERTICAL },
		],
	},
	{
		id: 'snapchat',
		name: 'Snapchat',
		logo: 'snapchat',
		formats: [{ id: 'story', label: () => m.social_story(), ...VERTICAL }],
	},
	{ id: 'x', name: 'X', logo: 'x', formats: [{ id: 'post', label: () => m.social_post(), ...WIDE }] },
	{
		id: 'threads',
		name: 'Threads',
		logo: 'threads',
		formats: [{ id: 'post', label: () => m.social_post(), ...PORTRAIT }],
	},
	{
		id: 'linkedin',
		name: 'LinkedIn',
		logo: 'linkedin',
		formats: [
			{ id: 'square', label: () => m.social_square(), ...SQUARE },
			{ id: 'landscape', label: () => m.social_landscape(), ...WIDE },
		],
	},
	{
		id: 'pinterest',
		name: 'Pinterest',
		logo: 'pinterest',
		formats: [{ id: 'pin', label: () => m.social_pin(), aspect: '2:3', width: 1000, height: 1500 }],
	},
];

function shapeOf(network: Network, format: Network['formats'][number]): SocialShape {
	return {
		id: `${network.id}-${format.id}`,
		name: () => `${network.name} ${format.label()}`,
		aspect: format.aspect,
		width: format.width,
		height: format.height,
	};
}

/** The shape's outline, drawn at its proportions. */
function Glyph({ width, height }: { width: number; height: number }) {
	const ratio = width / height;
	return (
		<span className="grid size-4 flex-none place-items-center" aria-hidden="true">
			<span
				className="rounded-[2px] border-[1.5px] border-current"
				style={{ width: ratio >= 1 ? 16 : 16 * ratio, height: ratio >= 1 ? 16 / ratio : 16 }}
			/>
		</span>
	);
}

/**
 * The shapes social networks show pictures and videos in, network by network, with a search to
 * find one fast. Choosing one crops to that shape from the middle; the crop can then be moved.
 */
export function SocialShapes({ chosen, onChoose }: { chosen: string | null; onChoose: (shape: SocialShape) => void }) {
	const [query, setQuery] = useState('');
	const words = searchable(query).split(/\s+/).filter(Boolean);
	const shown = NETWORKS.map((network) => ({
		network,
		formats: network.formats.filter((format) => {
			const haystack = searchable(`${network.name} ${format.label()} ${format.aspect}`);
			return words.every((word) => haystack.includes(word));
		}),
	})).filter((entry) => entry.formats.length > 0);
	return (
		<div className="grid gap-3">
			<SearchField value={query} onChange={setQuery} label={m.social_search()} />
			<div role="radiogroup" aria-label={m.crop_social()} className="grid">
				{shown.map(({ network, formats }) => (
					<div
						key={network.id}
						className="border-line grid grid-cols-[7.5rem_minmax(0,1fr)] items-start gap-2 border-b py-2 last:border-b-0 max-[380px]:grid-cols-1"
					>
						<span className="text-ui flex h-8 min-w-0 items-center gap-2 font-medium">
							<BrandLogo logo={network.logo} size={20} />
							<span className="truncate">{network.name}</span>
						</span>
						<div className="flex flex-wrap gap-1.5">
							{formats.map((format) => {
								const shape = shapeOf(network, format);
								return (
									<button
										key={shape.id}
										type="button"
										role="radio"
										aria-checked={chosen === shape.id}
										aria-label={`${network.name} ${format.label()} ${format.aspect}`}
										title={`${format.width} × ${format.height}`}
										onClick={() => {
											onChoose(shape);
										}}
										className="text-small text-ink-2 hover:bg-surface hover:text-ink aria-checked:bg-ed-soft aria-checked:text-ink flex h-8 items-center gap-1.5 rounded-sm px-2 shadow-[inset_0_0_0_1px_var(--line-2)] transition-[background-color,box-shadow] aria-checked:shadow-[inset_0_0_0_1.5px_var(--ed)]"
									>
										<Glyph width={format.width} height={format.height} />
										<span className="font-medium whitespace-nowrap">{format.label()}</span>
										<span className="text-muted tabular">{format.aspect}</span>
									</button>
								);
							})}
						</div>
					</div>
				))}
				{shown.length === 0 && <p className="text-small text-muted py-2">{m.search_nothing()}</p>}
			</div>
		</div>
	);
}
