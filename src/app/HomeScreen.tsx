import { Link } from '@tanstack/react-router';
import { Code, Plus, ShieldCheck, UserX, WifiOff } from 'lucide-react';
import { type KeyboardEvent, useId, useState } from 'react';
import { EDITOR_ORDER, EDITORS, type MediaKind } from '@/editors/registry';
import { useSession } from '@/media/session';
import { Tile } from '@/ui/Tile';
import { errorMessage } from './DropZone';
import { usePageHead } from './head';
import { homeCopy } from './home/copy';
import { Shot } from './home/Shot';
import { OpenFileButton } from './OpenFileButton';
import { ResumeCard } from './ResumeCard';
import { SiteFooter } from './SiteFooter';
import { SiteHeader } from './SiteHeader';
import { TASKS } from './tasks';

const WRAP = 'mx-auto w-full max-w-[76rem] px-[clamp(1rem,4vw,2.5rem)]';
const SECTION = 'grid scroll-mt-20 gap-8 pt-[clamp(4rem,8vw,6.5rem)]';
const H2 = 'text-[clamp(2rem,4vw,3rem)] leading-[1.05] font-bold tracking-[-0.035em] text-balance';

/** The colours of the five editors, around the product picture. */
const GLOW =
	'conic-gradient(from 200deg, var(--video-1), var(--subtitles-1), var(--audio-1), var(--image-1), var(--gif-1), var(--video-1))';

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

function Hero() {
	const copy = homeCopy();
	const error = useSession((state) => state.error);
	return (
		<section className="grid justify-items-center gap-6 pt-[clamp(3rem,8vw,6rem)] text-center">
			<span className="bg-surface text-ui text-ink-2 inline-flex items-center gap-2 rounded-full py-1.5 pr-3.5 pl-2">
				<span className="flex" aria-hidden="true">
					{EDITOR_ORDER.map((kind) => (
						<span
							key={kind}
							data-media={kind}
							className="bg-ed -ml-1 size-3.5 rounded-full shadow-[0_0_0_2px_var(--surface)] first:ml-0"
						/>
					))}
				</span>
				{copy.eyebrow}
			</span>
			<h1 className="max-w-[16ch] text-[clamp(2.5rem,6vw,4.5rem)] leading-[1.02] font-bold tracking-[-0.045em] text-balance">
				{copy.title}
			</h1>
			<p className="text-muted max-w-[44ch] text-[clamp(1.0625rem,1.6vw,1.3rem)] text-balance">{copy.lede}</p>
			<div className="grid justify-items-center gap-2.5">
				<OpenFileButton reading={copy.reading} className="h-13 rounded-md px-6.5 text-[1.0625rem]">
					{copy.open}
				</OpenFileButton>
				<span className="text-ui text-muted">{copy.dropHint}</span>
				{error && (
					<p role="alert" className="text-body text-danger max-w-[60ch]">
						{errorMessage(error)}
					</p>
				)}
			</div>
			<div className="w-full max-w-[40rem] text-left">
				<ResumeCard />
			</div>
			<div className="relative mt-6 w-full">
				<div
					aria-hidden="true"
					className="absolute inset-[8%_4%_-4%] rounded-[3rem] opacity-30 blur-[70px]"
					style={{ background: GLOW }}
				/>
				<div className="border-line relative overflow-hidden rounded-xl border shadow-[0_30px_80px_-30px_rgb(0_0_0/0.45)]">
					<Shot name="image-looks" alt={copy.heroAlt} sizes="(min-width: 1216px) 1136px, 94vw" eager />
				</div>
			</div>
		</section>
	);
}

function Trust() {
	const copy = homeCopy();
	const icons = [ShieldCheck, UserX, Code, WifiOff];
	return (
		<ul className="border-line mt-[clamp(4rem,8vw,6rem)] grid grid-cols-[repeat(auto-fit,minmax(13rem,1fr))] gap-4 border-y py-7">
			{copy.trust.map((text, index) => {
				const Icon = icons[index] ?? ShieldCheck;
				return (
					<li key={text} className="text-body text-ink-2 flex items-center gap-3 font-medium">
						<Icon className="text-muted size-5 flex-none" aria-hidden="true" />
						{text}
					</li>
				);
			})}
		</ul>
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
			<SectionHeader id="editors" title={copy.editorsTitle} lede={copy.editorsLede} />
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
					<h3 className="text-[1.75rem] font-bold tracking-[-0.03em]">{editor.title}</h3>
					<p className="text-lead text-muted">{editor.lede}</p>
					<ul className="grid gap-4">
						{editor.points.map(([title, text]) => (
							<li key={title} className="grid gap-0.5 border-l-2 border-[var(--ed)] pl-4">
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
			<SectionHeader id="tasks" title={copy.tasksTitle} lede={copy.tasksLede} />
			<ul className="grid grid-cols-[repeat(auto-fill,minmax(15rem,1fr))] gap-3">
				{TASKS.map((task) => (
					<li key={task.slug} data-media={task.editor}>
						<Link
							to="/tools/$task"
							params={{ task: task.slug }}
							className="bg-surface hover:bg-surface-2 flex h-full items-center gap-3.5 rounded-md p-4 transition-[background-color,transform] duration-200 hover:-translate-y-0.5"
						>
							<Tile kind={task.editor} size="lg" className="!rounded-full" />
							<span className="grid">
								<span className="text-body font-semibold">{task.title()}</span>
								<span className="text-small text-muted">{EDITORS[task.editor].label()}</span>
							</span>
						</Link>
					</li>
				))}
			</ul>
		</section>
	);
}

function Formats() {
	const copy = homeCopy();
	return (
		<section className={SECTION} aria-labelledby="formats">
			<SectionHeader id="formats" title={copy.formatsTitle} lede={copy.formatsLede} />
			<div className="grid grid-cols-[repeat(auto-fit,minmax(13rem,1fr))] gap-4">
				{copy.formats.map((group) => (
					<div
						key={group.kind}
						data-media={group.kind}
						className="grid content-start gap-3 rounded-md p-5 shadow-[inset_0_0_0_1px_var(--line)]"
					>
						<h3 className="text-body flex items-center gap-2.5 font-semibold">
							<Tile kind={group.kind} size="sm" />
							{group.title}
						</h3>
						<ul className="flex flex-wrap gap-1.5">
							{group.items.map((item) => (
								<li
									key={item}
									className="bg-surface text-caption rounded-xs px-2 py-1 font-mono font-medium"
								>
									{item}
								</li>
							))}
						</ul>
					</div>
				))}
			</div>
		</section>
	);
}

function Why() {
	const copy = homeCopy();
	return (
		<section className={SECTION} aria-labelledby="why">
			<SectionHeader id="why" title={copy.whyTitle} />
			<div className="grid gap-4 sm:grid-cols-2">
				{copy.why.map((item) => (
					<div key={item.title} className="bg-surface grid content-start gap-2.5 rounded-md p-6">
						<span className="font-mono text-[2.25rem] leading-none font-semibold tracking-[-0.04em]">
							{item.big}
						</span>
						<h3 className="text-title font-bold tracking-[-0.02em]">{item.title}</h3>
						<p className="text-body text-muted">{item.text}</p>
					</div>
				))}
			</div>
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

function Final() {
	const copy = homeCopy();
	return (
		<section className="bg-ink text-bg mt-[clamp(4rem,8vw,6rem)] grid justify-items-start gap-5 rounded-xl p-[clamp(2.5rem,6vw,4rem)]">
			<h2 className={`${H2} max-w-[18ch]`}>{copy.finalTitle}</h2>
			{/* The dark block turns the button light. */}
			<OpenFileButton reading={copy.reading} className="!bg-bg !text-ink h-13 rounded-md px-6.5 text-[1.0625rem]">
				{copy.open}
			</OpenFileButton>
		</section>
	);
}

export function HomeScreen() {
	usePageHead(null);
	return (
		<div className="flex min-h-full flex-col">
			<SiteHeader />
			<main className={WRAP}>
				<Hero />
				<Trust />
				<EditorTabs />
				<Tasks />
				<Formats />
				<Why />
				<Faq />
				<Final />
			</main>
			<SiteFooter />
		</div>
	);
}
