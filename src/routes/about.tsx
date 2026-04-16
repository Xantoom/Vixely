import { createFileRoute, Link } from '@tanstack/react-router';
import { ShieldCheck, Cpu, Globe, Heart, ArrowRight } from 'lucide-react';
import { Seo } from '@/components/Seo.tsx';

export const Route = createFileRoute('/about')({ component: AboutPage });

const principles = [
	{
		icon: ShieldCheck,
		title: 'Local-first by design',
		description:
			'Every feature is built to run in the browser. Nothing is uploaded, nothing is stored on a server. Your media belongs to you.',
	},
	{
		icon: Cpu,
		title: 'Native speed on the web',
		description:
			'We use native WebCodecs, WebGL2, Web Audio and Mediabunny to deliver performance close to a native desktop editor — with zero install.',
	},
	{
		icon: Globe,
		title: 'Accessible, everywhere',
		description:
			'Vixely works on any modern browser, on Windows, macOS, Linux, Android and iPadOS — including low-spec devices.',
	},
	{
		icon: Heart,
		title: 'Free and ad-supported',
		description:
			'Vixely is free to use. Small, privacy-respecting ads keep the project alive. No subscriptions, no watermarks, no feature walls.',
	},
];

function AboutPage() {
	return (
		<>
			<Seo
				title="About Vixely — Private, Local-First Media Editing"
				description="About Vixely — the story behind the free, local-first video, image and GIF editor. Our mission: professional media editing without uploads, servers or tracking."
				path="/about"
			/>

			<div className="h-full overflow-y-auto bg-bg">
				<section className="px-4 py-16 sm:py-24 bg-home-glow relative overflow-hidden">
					<div className="absolute inset-0 landing-grid pointer-events-none" aria-hidden="true" />
					<div className="relative z-10 max-w-3xl mx-auto text-center">
						<h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold tracking-tight leading-tight mb-4">
							<span className="text-gradient">About Vixely</span>
						</h1>
						<p className="text-[15px] sm:text-base text-text-secondary leading-relaxed mb-8 max-w-xl mx-auto">
							Vixely is a free, local-first media editing suite. We believe your files should stay on your
							device — and that professional editing doesn&apos;t need a server farm.
						</p>
					</div>
				</section>

				<section className="px-4 py-16 sm:py-20">
					<div className="max-w-3xl mx-auto">
						<h2 className="text-lg sm:text-xl font-bold tracking-tight mb-4">Why we built this</h2>
						<div className="flex flex-col gap-4 text-[14px] text-text-secondary leading-relaxed">
							<p>
								Most online editors work the same way: you upload a video, wait, hope the server encodes
								it correctly, then download the result. Your footage ends up on a third party&apos;s
								servers — sometimes for hours, sometimes forever. For private media, professional shoots
								or client work, that&apos;s a problem.
							</p>
							<p>
								Vixely takes the opposite approach. We treat the browser as a real runtime: native
								WebCodecs for hardware-accelerated encode/decode, WebGL2 filter pipelines, Web Audio for
								sound, and the Mediabunny library for container I/O. Everything runs on your machine, at
								native-ish speed, with zero uploads.
							</p>
							<p>
								The result: a video, image and GIF editor that&apos;s as fast as the best desktop
								alternatives, works offline once loaded, and never sees your files.
							</p>
						</div>
					</div>
				</section>

				<section className="px-4 py-16 sm:py-20 bg-surface/30">
					<div className="max-w-4xl mx-auto">
						<h2 className="text-center text-lg sm:text-xl font-bold tracking-tight mb-10">
							What we stand for
						</h2>
						<div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
							{principles.map((p) => (
								<div key={p.title} className="rounded-xl border border-border bg-surface/40 p-5">
									<div className="h-10 w-10 rounded-lg bg-accent/8 flex items-center justify-center mb-3">
										<p.icon size={18} className="text-accent" strokeWidth={1.5} />
									</div>
									<h3 className="text-[14px] font-semibold mb-1.5">{p.title}</h3>
									<p className="text-[13px] text-text-tertiary leading-relaxed">{p.description}</p>
								</div>
							))}
						</div>
					</div>
				</section>

				<section className="px-4 py-16 sm:py-20">
					<div className="max-w-3xl mx-auto">
						<h2 className="text-lg sm:text-xl font-bold tracking-tight mb-4">The stack</h2>
						<p className="text-[14px] text-text-secondary leading-relaxed mb-4">
							Vixely is built with React 19, TypeScript, TanStack Router, TailwindCSS and Zustand on the
							frontend. The heavy lifting uses Mediabunny for media I/O, the native WebCodecs API for
							hardware-accelerated encoding/decoding, the Web Audio API for sound, WebGL2 for real-time
							color correction and filter previews, and JASSUB for ASS/SSA subtitle rendering.
						</p>
						<p className="text-[14px] text-text-secondary leading-relaxed">
							All code runs on your device. The only server is a static file host — no upload endpoint, no
							database, no session.
						</p>
					</div>
				</section>

				<section className="px-4 py-12 border-t border-border">
					<div className="max-w-3xl mx-auto text-center">
						<h2 className="text-lg sm:text-xl font-bold tracking-tight mb-4">Start editing</h2>
						<p className="text-[14px] text-text-secondary mb-6">Pick a tool to get started.</p>
						<div className="flex flex-wrap items-center justify-center gap-3">
							<Link
								to="/tools/video"
								className="inline-flex items-center gap-2 rounded-xl bg-blue-500 hover:bg-blue-500/90 px-4 py-2.5 text-[13px] font-semibold text-white transition-colors"
							>
								Video Editor <ArrowRight size={14} strokeWidth={2.2} />
							</Link>
							<Link
								to="/tools/image"
								className="inline-flex items-center gap-2 rounded-xl bg-amber-500 hover:bg-amber-500/90 px-4 py-2.5 text-[13px] font-semibold text-white transition-colors"
							>
								Image Editor <ArrowRight size={14} strokeWidth={2.2} />
							</Link>
							<Link
								to="/tools/gif"
								className="inline-flex items-center gap-2 rounded-xl bg-emerald-500 hover:bg-emerald-500/90 px-4 py-2.5 text-[13px] font-semibold text-white transition-colors"
							>
								GIF Editor <ArrowRight size={14} strokeWidth={2.2} />
							</Link>
						</div>
					</div>
				</section>
			</div>
		</>
	);
}
