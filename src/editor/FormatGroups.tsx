import { ChevronDown } from 'lucide-react';
import { useState } from 'react';
import { BrandLogo, type LogoId } from '@/ui/BrandLogo';

interface FormatChoice {
	id: string;
	label: string;
	/** Size and file type, under the label. */
	detail: string;
	/** The shape of the picture, drawn to scale. */
	width: number;
	height: number;
}

export interface FormatGroup {
	title: string;
	logo: LogoId;
	choices: FormatChoice[];
}

/**
 * Sizes platforms ask for, one folding row per platform with its logo. The platform holding the
 * choice made opens first and is marked while folded.
 */
export function FormatGroups({
	groups,
	chosen,
	onChoose,
}: {
	groups: FormatGroup[];
	chosen: string | null;
	onChoose: (id: string) => void;
}) {
	const [open, setOpen] = useState<LogoId | null>(
		() => groups.find((group) => group.choices.some((choice) => choice.id === chosen))?.logo ?? null,
	);
	return (
		<div className="grid gap-1">
			{groups.map((group) => {
				const expanded = open === group.logo;
				const holds = group.choices.some((choice) => choice.id === chosen);
				return (
					<div key={group.logo} className="grid">
						<button
							type="button"
							aria-expanded={expanded}
							aria-label={group.title}
							onClick={() => {
								setOpen(expanded ? null : group.logo);
							}}
							className="hover:bg-surface text-ui grid grid-cols-[auto_minmax(0,1fr)_auto_auto] items-center gap-3 rounded-sm px-2 py-1.5 text-left font-medium transition-colors"
						>
							<BrandLogo logo={group.logo} size={26} />
							<span className="truncate">{group.title}</span>
							{holds ? (
								<span className="bg-ed size-1.5 rounded-full" aria-hidden="true" />
							) : (
								<span className="text-caption text-muted tabular">{group.choices.length}</span>
							)}
							<ChevronDown
								size={16}
								aria-hidden="true"
								className={`text-muted transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}
							/>
						</button>
						{expanded && (
							<div className="menu-in grid gap-1 py-1 pl-[2.6rem]">
								{group.choices.map((choice) => {
									const wide = choice.width >= choice.height;
									return (
										<button
											key={choice.id}
											type="button"
											aria-pressed={chosen === choice.id}
											aria-label={`${group.title} ${choice.label}, ${choice.detail}`}
											onClick={() => {
												onChoose(choice.id);
											}}
											className="bg-surface hover:bg-surface-2 aria-pressed:bg-ed-soft aria-pressed:shadow-[inset_0_0_0_1.5px_var(--ed)] ease-spring grid grid-cols-[1.5rem_minmax(0,1fr)] items-center gap-2.5 rounded-sm px-2.5 py-1.5 text-left transition-[background-color,transform] duration-200 active:scale-[0.98]"
										>
											<span className="grid size-6 place-items-center" aria-hidden="true">
												<span
													className="border-ink-2 rounded-[2px] border-[1.5px]"
													style={{
														width: wide
															? '100%'
															: `${(choice.width / choice.height) * 100}%`,
														height: wide
															? `${(choice.height / choice.width) * 100}%`
															: '100%',
													}}
												/>
											</span>
											<span className="grid min-w-0">
												<span className="text-ui truncate">{choice.label}</span>
												<span className="text-caption text-muted tabular">{choice.detail}</span>
											</span>
										</button>
									);
								})}
							</div>
						)}
					</div>
				);
			})}
		</div>
	);
}
