import { Fragment, type ReactNode } from 'react';
import { Menu as DsMenu, MenuItem as DsMenuItem, MenuLabel, MenuSeparator } from 'xantoom-design/react';

export interface MenuItem<T extends string> {
	value: T;
	label: string;
	/** Drawn before the label: a flag, an icon. */
	leading?: ReactNode;
	/** Shown dimmed after the label, such as a codec. */
	detail?: string;
	/** Shown dimmed under the label, such as what a track is made of. */
	description?: string;
	disabled?: boolean;
	/** A rule under it, setting it apart from the choices after it, such as Off. */
	divider?: boolean;
}

/**
 * A button that opens a short menu of choices, one of them current: the language, the theme, the track played. Unlike
 * a `Select`, the button is drawn by the caller (an icon, a flag) and shows nothing of the choice by itself. The menu is
 * the design system's: a popover in the top layer (above a fullscreen player too), with its keyboard.
 */
export function Menu<T extends string>({
	label,
	value,
	items,
	onChange,
	children,
	title,
	header,
	rows,
	className = '',
	buttonClassName = '',
}: {
	/** Announced name of the menu and its button, and the button's tooltip. */
	label: string;
	value: T | null;
	items: MenuItem<T>[];
	onChange: (value: T) => void;
	/** The button's face. */
	children: ReactNode;
	/** A heading at the top of the menu. */
	title?: string;
	/** What the menu is about, above its choices, such as a file's whole name. */
	header?: ReactNode;
	/** Choices shown at once; past them the list scrolls, the next one peeking out. */
	rows?: number;
	className?: string;
	buttonClassName?: string;
}) {
	const described = items.some((item) => item.description);
	return (
		<span className={`inline-flex ${className}`} style={rows === undefined ? undefined : { '--rows': rows + 0.5 }}>
			<DsMenu
				label={label}
				className={`${described ? 'w-[min(18rem,calc(100vw-16px))]' : 'min-w-44'} ${
					rows === undefined ? '' : 'max-h-[calc((var(--x-control)-0.25rem)*var(--rows)+2.5rem)]'
				}`}
				trigger={(props) => (
					<button
						{...props}
						type="button"
						aria-label={label}
						data-tip={props['aria-expanded'] ? undefined : label}
						className={`text-fg-muted hover:bg-sunken hover:text-fg aria-expanded:bg-sunken aria-expanded:text-fg x-touch-target relative grid h-10 min-w-10 place-items-center rounded-lg transition-colors duration-150 ${buttonClassName}`}
					>
						{children}
					</button>
				)}
			>
				{title ? <MenuLabel>{title}</MenuLabel> : null}
				{header ? <div className="border-line mb-1 border-b px-3 pt-1 pb-2.5">{header}</div> : null}
				{items.map((item) => (
					<Fragment key={item.value}>
						<DsMenuItem
							icon={item.leading}
							checked={value === null ? undefined : item.value === value}
							disabled={item.disabled}
							onSelect={() => {
								if (item.value !== value) onChange(item.value);
							}}
						>
							<span className="flex items-baseline gap-3">
								<span className={`grid min-w-0 flex-1 gap-0.5 ${item.description ? 'py-1.5' : ''}`}>
									<span className="truncate">{item.label}</span>
									{item.description ? (
										<span className="text-caption text-fg-faint x-tabular truncate">
											{item.description}
										</span>
									) : null}
								</span>
								{item.detail ? (
									<span className="text-fg-faint text-small flex-none whitespace-nowrap">
										{item.detail}
									</span>
								) : null}
							</span>
						</DsMenuItem>
						{item.divider ? <MenuSeparator /> : null}
					</Fragment>
				))}
			</DsMenu>
		</span>
	);
}
