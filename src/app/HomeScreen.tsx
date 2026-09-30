import { Link, useNavigate } from '@tanstack/react-router';
import { ChevronDown, Plus, Upload } from 'lucide-react';
import { type KeyboardEvent, useId, useRef, useState } from 'react';
import { EDITOR_ORDER, EDITORS, type MediaKind } from '@/editors/registry';
import { useSession } from '@/media/session';
import { Tile } from '@/ui/Tile';
import { errorMessage } from './DropZone';
import { usePageHead } from './head';
import { homeCopy } from './home/copy';
import { Shot } from './home/Shot';
import { useLocale } from './locale';
import { ResumeCard } from './ResumeCard';
import { SiteFooter } from './SiteFooter';
import { SiteHeader } from './SiteHeader';
import { TASKS } from './tasks';

const WRAP = 'mx-auto w-full max-w-[76rem] px-[clamp(1rem,4vw,2.5rem)]';
const SECTION = 'grid scroll-mt-20 gap-8 pt-[clamp(4rem,8vw,6.5rem)] max-md:gap-5 max-md:pt-14';
const H2 = 'font-display text-[clamp(1.75rem,4vw,3rem)] leading-[1.05] font-bold tracking-[-0.02em] text-balance';

function SectionHeader({ id, title, lede }: { id: string; title: string; lede?: string }) {
	return (
		<header className="grid max-w-[44rem] gap-3">
			<h2 id={id} className={H2}>
				{title}
			</h2>
			{lede && <p className="text-lead text-muted">{lede}</p>}
		</header>
	);
}

/** The hidden file input of the page and what opening a file does: its editor opens. */
function useFilePicker() {
	const open = useSession((state) => state.open);
	const busy = useSession((state) => state.reading !== null);
	const navigate = useNavigate();
	const inputRef = useRef<HTMLInputElement>(null);
	const choose = () => {
		if (!busy) inputRef.current?.click();
	};
	const input = (
		<input
			ref={inputRef}
			type="file"
			multiple
			className="hidden"
			tabIndex={-1}
			onChange={(event) => {
				const files = [...(event.target.files ?? [])];
				event.target.value = '';
				void open(files).then(async (kind) => {
					if (kind) await navigate({ to: EDITORS[kind].path });
				});
			}}
		/>
	);
	return { busy, choose, input };
}

/**
 * The top of the page is the way in: one large area that takes a dropped, pasted or chosen file
 * and opens the editor made for it, on a phone as on a computer, where a press chooses the file.
 */
function Hero() {
	const copy = homeCopy();
	const error = useSession((state) => state.error);
	const { busy, choose, input } = useFilePicker();
	return (
		<section className="grid gap-4 pt-[clamp(1.5rem,4vw,3rem)] max-md:pt-6" aria-labelledby="start">
			<div
				role="button"
				tabIndex={0}
				aria-labelledby="start"
				aria-describedby="start-hint"
				aria-disabled={busy || undefined}
				onClick={choose}
				onKeyDown={(event) => {
					if (event.key === 'Enter' || event.key === ' ') {
						event.preventDefault();
						choose();
					}
				}}
				className="group border-line-2 bg-surface hover:border-ink-2 focus-visible:outline-ink relative grid min-h-[clamp(20rem,52vh,30rem)] place-content-center justify-items-center gap-6 rounded-xl border-[1.5px] border-dashed px-6 py-12 text-center transition-colors duration-150 aria-disabled:cursor-progress max-md:min-h-[26rem] max-md:gap-5 max-md:px-5 max-md:py-10"
			>
				<div className="flex gap-2.5" aria-hidden="true">
					{EDITOR_ORDER.map((kind, index) => (
						<span
							key={kind}
							data-media={kind}
							className="transition-transform duration-200 group-hover:-translate-y-1"
							style={{ transitionDelay: `${index * 30}ms` }}
						>
							<Tile kind={kind} size="xl" className="max-sm:size-11! max-sm:rounded-[0.7rem]!" />
						</span>
					))}
				</div>
				<div className="grid justify-items-center gap-2">
					<h1
						id="start"
						className="font-display max-w-[20ch] text-[clamp(2rem,4.6vw,3.5rem)] leading-[1.02] font-bold tracking-[-0.025em] text-balance"
					>
						{busy ? (
							copy.reading
						) : (
							<>
								<span className="pointer-coarse:hidden">{copy.title}</span>
								<span className="pointer-fine:hidden">{copy.touchTitle}</span>
							</>
						)}
					</h1>
					<p
						id="start-hint"
						className="text-ink-2 max-w-[46ch] text-[clamp(1rem,1.4vw,1.1875rem)] leading-snug"
					>
						{copy.lede}
					</p>
				</div>
				<div className="grid justify-items-center gap-2">
					<span className="bg-ink text-bg inline-flex h-12 items-center gap-2.5 rounded-md px-6 text-[1.0625rem] font-semibold max-md:h-13 transition-[filter] duration-150 group-hover:brightness-125">
						<Upload className="size-[1.15em]" aria-hidden="true" />
						{copy.open}
					</span>
					<span className="text-ui text-muted pointer-coarse:hidden">{copy.dropHint}</span>
				</div>
			</div>
			{input}
			{error && (
				<p role="alert" className="text-body text-danger max-w-[60ch]">
					{errorMessage(error)}
				</p>
			)}
			<div className="grid justify-items-center has-[>div:empty]:hidden">
				<div className="w-full max-w-[40rem]">
					<ResumeCard />
				</div>
			</div>
		</section>
	);
}

function EditorTabs() {
	const copy = homeCopy();
	const [kind, setKind] = useState<MediaKind>('video');
	const [shot, setShot] = useState(0);
	const base = useId();
	const editor = copy.editors[kind];
	const current = editor.shots[shot] ?? editor.shots[0];

	const choose = (next: MediaKind) => {
		setKind(next);
		setShot(0);
	};
	// Arrow keys move between tabs, as in any tab list.
	const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
		const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
		if (!step) return;
		event.preventDefault();
		const index = (EDITOR_ORDER.indexOf(kind) + step + EDITOR_ORDER.length) % EDITOR_ORDER.length;
		const next = EDITOR_ORDER[index] ?? 'video';
		choose(next);
		document.getElementById(`${base}-tab-${next}`)?.focus();
	};

	return (
		<section className={SECTION} aria-labelledby="editors">
			<SectionHeader id="editors" title={copy.editorsTitle} />
			<div role="tablist" aria-labelledby="editors" className="flex flex-wrap gap-2">
				{EDITOR_ORDER.map((id) => (
					<button
						key={id}
						id={`${base}-tab-${id}`}
						type="button"
						role="tab"
						data-media={id}
						aria-selected={id === kind}
						aria-controls={`${base}-panel`}
						tabIndex={id === kind ? 0 : -1}
						onClick={() => {
							choose(id);
						}}
						onKeyDown={onKeyDown}
						className="text-body flex items-center gap-2.5 rounded-full py-1.5 pr-4 pl-1.5 font-semibold shadow-[inset_0_0_0_1px_var(--line-2)] transition-[background-color,box-shadow] duration-150 hover:bg-[var(--surface)] aria-selected:bg-[var(--surface)] aria-selected:shadow-[inset_0_0_0_1.5px_var(--ed)]"
					>
						<Tile kind={id} className="!rounded-full" />
						{copy.editors[id].title}
					</button>
				))}
			</div>
			<div
				id={`${base}-panel`}
				role="tabpanel"
				aria-labelledby={`${base}-tab-${kind}`}
				data-media={kind}
				className="grid items-start gap-[clamp(1.5rem,4vw,3.5rem)] lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]"
			>
				<figure className="grid gap-3">
					<div className="border-line overflow-hidden rounded-lg border shadow-[0_24px_60px_-30px_rgb(0_0_0/0.4)]">
						{current && (
							<Shot
								key={current.name}
								name={current.name}
								alt={current.alt}
								sizes="(min-width: 1024px) 700px, 94vw"
							/>
						)}
					</div>
					<figcaption className="flex flex-wrap gap-2">
						{editor.shots.map((item, index) => (
							<button
								key={item.name}
								type="button"
								aria-pressed={index === shot}
								onClick={() => {
									setShot(index);
								}}
								className="text-ui text-muted hover:text-ink aria-pressed:bg-surface aria-pressed:text-ink rounded-full px-3.5 py-1.5 font-medium transition-colors"
							>
								{item.caption}
							</button>
						))}
					</figcaption>
				</figure>
				<div className="grid gap-5">
					<h3 className="font-display text-[1.75rem] font-bold tracking-[-0.025em]">{editor.title}</h3>
					<p className="text-lead text-muted">{editor.lede}</p>
					<ul className="grid gap-4">
						{editor.points.map(([title, text]) => (
							<li key={title} className="grid gap-0.5">
								<span className="text-body font-semibold">{title}</span>
								<span className="text-ui text-muted">{text}</span>
							</li>
						))}
					</ul>
					<Link
						to={EDITORS[kind].path}
						className="bg-ed text-ed-ink text-body inline-flex h-11 items-center justify-self-start rounded-sm px-5 font-semibold transition-[filter] hover:brightness-[1.07]"
					>
						{editor.open}
					</Link>
				</div>
			</div>
		</section>
	);
}

function Tasks() {
	const copy = homeCopy();
	return (
		<section className={SECTION} aria-labelledby="tasks">
			<SectionHeader id="tasks" title={copy.tasksTitle} />
			<div className="grid grid-cols-[repeat(auto-fill,minmax(12.5rem,1fr))] gap-x-8 gap-y-10 max-md:hidden">
				{EDITOR_ORDER.map((kind) => (
					<div key={kind} data-media={kind} className="grid content-start gap-3">
						<h3 className="text-body flex items-center gap-2.5 font-semibold">
							<Tile kind={kind} size="sm" />
							{copy.editors[kind].title}
						</h3>
						<ul className="border-line grid border-t">
							{TASKS.filter((task) => task.editor === kind).map((task) => (
								<li key={task.slug} className="border-line border-b">
									<Link
										to="/tools/$task"
										params={{ task: task.slug }}
										className="text-body text-ink-2 hover:text-ink decoration-(--ed) block py-2.5 underline-offset-4 transition-colors hover:underline"
									>
										{task.title()}
									</Link>
								</li>
							))}
						</ul>
					</div>
				))}
			</div>
			<div className="border-line -mt-2 grid border-t md:hidden">
				{EDITOR_ORDER.map((kind) => {
					const tasks = TASKS.filter((task) => task.editor === kind);
					return (
						<details key={kind} data-media={kind} className="group border-line border-b">
							<summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 [&::-webkit-details-marker]:hidden">
								<Tile kind={kind} size="sm" />
								<span className="text-body flex-1 font-semibold">{copy.editors[kind].title}</span>
								<span className="text-small text-muted tabular">{tasks.length}</span>
								<ChevronDown
									className="text-muted size-5 transition-transform duration-200 group-open:rotate-180"
									aria-hidden="true"
								/>
							</summary>
							<ul className="grid pb-3 pl-10">
								{tasks.map((task) => (
									<li key={task.slug}>
										<Link
											to="/tools/$task"
											params={{ task: task.slug }}
											className="text-body text-ink-2 active:text-ink block py-2.5"
										>
											{task.title()}
										</Link>
									</li>
								))}
							</ul>
						</details>
					);
				})}
			</div>
		</section>
	);
}

function Formats() {
	const copy = homeCopy();
	return (
		<section className={SECTION} aria-labelledby="formats">
			<SectionHeader id="formats" title={copy.formatsTitle} />
			<dl className="border-line grid border-t">
				{copy.formats.map((group) => (
					<div
						key={group.kind}
						data-media={group.kind}
						className="border-line grid gap-x-8 gap-y-1 border-b py-4 sm:grid-cols-[12rem_minmax(0,1fr)]"
					>
						<dt className="text-body flex items-center gap-2.5 font-semibold">
							<span className="bg-ed size-2 rounded-full" aria-hidden="true" />
							{group.title}
						</dt>
						<dd className="text-body text-ink-2">{group.items.join(', ')}</dd>
					</div>
				))}
			</dl>
		</section>
	);
}

function Faq() {
	const copy = homeCopy();
	return (
		<section className={SECTION} aria-labelledby="faq">
			<SectionHeader id="faq" title={copy.faqTitle} />
			<div>
				{copy.faq.map(([question, answer]) => (
					<details key={question} className="group border-line border-b">
						<summary className="text-lead flex cursor-pointer list-none items-center justify-between gap-4 py-5 font-semibold [&::-webkit-details-marker]:hidden">
							{question}
							<Plus
								className="text-muted size-5 flex-none transition-transform duration-200 group-open:rotate-45"
								aria-hidden="true"
							/>
						</summary>
						<p className="text-body text-muted mb-5 max-w-[62ch]">{answer}</p>
					</details>
				))}
			</div>
		</section>
	);
}

export function HomeScreen() {
	useLocale();
	usePageHead(null);
	return (
		<div className="flex min-h-full flex-col">
			<SiteHeader />
			<main className={WRAP}>
				<Hero />
				<EditorTabs />
				<Tasks />
				<Formats />
				<Faq />
			</main>
			<SiteFooter />
		</div>
	);
}
