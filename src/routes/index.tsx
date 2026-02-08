import { useState, useCallback, type DragEvent } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Helmet } from "react-helmet-async";
import { Button } from "@/components/ui/index.ts";

export const Route = createFileRoute("/")({
	component: HomePage,
});

const VIDEO_TYPES = new Set(["video/mp4", "video/webm", "video/quicktime", "video/x-matroska", "video/avi"]);
const IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif", "image/bmp", "image/tiff"]);
const GIF_TYPE = "image/gif";

const tools = [
	{
		title: "Video",
		desc: "Trim, convert, and compress for any platform.",
		href: "/tools/video" as const,
		accent: "bg-violet-500",
	},
	{
		title: "Image",
		desc: "Filters, resize, and export. Real-time preview.",
		href: "/tools/image" as const,
		accent: "bg-blue-500",
	},
	{
		title: "GIF",
		desc: "Video to GIF with palette optimization.",
		href: "/tools/gif" as const,
		accent: "bg-emerald-500",
	},
];

function HomePage() {
	const navigate = useNavigate();
	const [dragging, setDragging] = useState(false);

	const detectRoute = useCallback((file: File): "/tools/video" | "/tools/image" | "/tools/gif" => {
		if (file.type === GIF_TYPE) return "/tools/gif";
		if (VIDEO_TYPES.has(file.type)) return "/tools/video";
		if (IMAGE_TYPES.has(file.type)) return "/tools/image";
		const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
		if (["mp4", "webm", "mov", "mkv", "avi"].includes(ext)) return "/tools/video";
		if (["gif"].includes(ext)) return "/tools/gif";
		return "/tools/image";
	}, []);

	const handleDrop = useCallback(
		(e: DragEvent<HTMLDivElement>) => {
			e.preventDefault();
			setDragging(false);
			const file = e.dataTransfer.files[0];
			if (!file) return;
			navigate({ to: detectRoute(file) });
		},
		[detectRoute, navigate],
	);

	const handleFileInput = useCallback(
		(e: React.ChangeEvent<HTMLInputElement>) => {
			const file = e.target.files?.[0];
			if (!file) return;
			navigate({ to: detectRoute(file) });
		},
		[detectRoute, navigate],
	);

	return (
		<>
			<Helmet>
				<title>Vixely — Private, Local-First Media Editing Suite</title>
				<meta name="description" content="Edit video, images, and GIFs entirely in your browser. No uploads, no servers. Powered by WebAssembly." />
			</Helmet>

			<div className="animate-fade-in bg-home-glow min-h-full">
				{/* ── Hero ── */}
				<section className="relative flex flex-col items-center px-4 sm:px-8 pt-16 sm:pt-24 pb-12 sm:pb-16 text-center overflow-hidden">
					{/* Glow orbs */}
					<div className="pointer-events-none absolute -top-40 left-1/2 -translate-x-1/2 h-[min(480px,60vh)] w-[min(640px,90vw)] rounded-full bg-accent/[0.08] blur-[120px]" />
					<div className="pointer-events-none absolute top-20 -left-32 h-[min(320px,40vh)] w-[min(320px,40vw)] rounded-full bg-blue-500/[0.04] blur-[100px]" />
					<div className="pointer-events-none absolute -bottom-20 right-0 h-[min(280px,35vh)] w-[min(280px,35vw)] rounded-full bg-emerald-500/[0.03] blur-[80px]" />

					<div className="relative max-w-2xl">
						<div className="mb-5 inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3.5 py-1.5 text-xs text-text-secondary">
							<span className="h-1.5 w-1.5 rounded-full bg-success animate-pulse-soft" />
							Everything stays on your device
						</div>

						<h1 className="text-3xl font-bold tracking-tight sm:text-4xl md:text-5xl lg:text-6xl leading-[1.1]">
							<span className="text-gradient">Edit media</span>
							<br />
							<span className="text-text">without the cloud.</span>
						</h1>

						<p className="mt-5 text-base text-text-secondary leading-relaxed max-w-md mx-auto">
							A private media suite that runs entirely in your browser.
							No uploads. No accounts. Just your files.
						</p>

						<div className="mt-8 flex items-center gap-3 justify-center">
							<Link to="/tools/video">
								<Button size="lg">Open Editor</Button>
							</Link>
						</div>
					</div>
				</section>

				{/* ── Drop Zone ── */}
				<section className="mx-auto max-w-xl xl:max-w-2xl px-4 sm:px-8 pb-12 sm:pb-16">
					<div
						onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
						onDragLeave={() => setDragging(false)}
						onDrop={handleDrop}
						className={`relative flex flex-col items-center justify-center rounded-2xl p-6 sm:p-10 ${
							dragging ? "drop-zone-active" : "drop-zone"
						}`}
					>
						<input
							type="file"
							className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
							accept="video/*,image/*"
							onChange={handleFileInput}
						/>

						<svg className="h-8 w-8 text-text-tertiary mb-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
							<path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12" />
						</svg>

						<p className="text-sm font-medium text-text-secondary">
							{dragging ? "Release to open..." : "Drop a file or click to browse"}
						</p>
						<p className="mt-1.5 text-xs text-text-tertiary">
							Videos, images, and GIFs auto-route to the right editor
						</p>

						<div className="mt-4 flex flex-wrap items-center justify-center gap-1.5">
							{["MP4", "MOV", "WebM", "PNG", "JPG", "WebP", "GIF"].map((ext) => (
								<span
									key={ext}
									className="rounded bg-surface-raised px-1.5 py-0.5 text-[10px] font-mono text-text-tertiary"
								>
									.{ext.toLowerCase()}
								</span>
							))}
						</div>
					</div>
				</section>

				{/* ── Tools ── */}
				<section className="mx-auto max-w-xl xl:max-w-2xl px-4 sm:px-8 pb-20 sm:pb-24">
					<div className="flex flex-col gap-3">
						{tools.map((tool) => (
							<Link
								key={tool.href}
								to={tool.href}
								className="group flex items-center gap-4 rounded-xl border border-border bg-surface p-4 transition-all hover:border-border/80 hover:bg-surface-raised"
							>
								<div className={`h-10 w-10 rounded-lg ${tool.accent} flex items-center justify-center shrink-0`}>
									<svg className="h-5 w-5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
										<path d="M5 12h14M12 5l7 7-7 7" />
									</svg>
								</div>
								<div className="flex-1 min-w-0">
									<h3 className="text-sm font-semibold group-hover:text-accent transition-colors">
										{tool.title}
									</h3>
									<p className="text-xs text-text-tertiary mt-0.5">{tool.desc}</p>
								</div>
								<svg className="h-4 w-4 text-text-tertiary group-hover:text-text-secondary transition-colors shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
									<path d="M9 18l6-6-6-6" />
								</svg>
							</Link>
						))}
					</div>
				</section>
			</div>
		</>
	);
}
