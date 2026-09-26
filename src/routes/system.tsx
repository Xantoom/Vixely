import { createFileRoute } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { SiteFooter } from '@/app/SiteFooter';
import { SiteHeader } from '@/app/SiteHeader';
import { codecName } from '@/lib/format';
import type { Capabilities, CodecSupport } from '@/media/capabilities';
import { m } from '@/paraglide/messages.js';

function State({ ok }: { ok: boolean }) {
	return <span className={ok ? 'text-ink' : 'text-muted'}>{ok ? m.available() : m.unavailable()}</span>;
}

function CodecTable({ title, codecs }: { title: string; codecs: CodecSupport[] }) {
	return (
		<section className="grid content-start gap-4">
			<h2 className="text-title font-bold tracking-[-0.03em]">{title}</h2>
			<table className="text-body w-full border-collapse">
				<thead>
					<tr className="text-ui text-muted border-line border-b text-left">
						<th className="py-2 font-medium">{m.system_codec()}</th>
						<th className="py-2 font-medium">{m.system_decode()}</th>
						<th className="py-2 font-medium">{m.system_encode()}</th>
					</tr>
				</thead>
				<tbody>
					{codecs.map((codec) => (
						<tr key={codec.codec} className="border-line border-b">
							<td className="py-2.5 text-caption font-mono">{codecName(codec.codec)}</td>
							<td className="py-2.5">
								<State ok={codec.decode} />
							</td>
							<td className="py-2.5">
								<State ok={codec.encode} />
							</td>
						</tr>
					))}
				</tbody>
			</table>
		</section>
	);
}

function SystemScreen() {
	const [caps, setCaps] = useState<Capabilities | null>(null);
	useEffect(() => {
		// Detection needs the media library: it loads once the page is shown and the browser idle.
		let live = true;
		const detect = () => {
			void import('@/media/capabilities')
				.then(async ({ detectCapabilities }) => detectCapabilities())
				.then((found) => {
					if (live) setCaps(found);
				});
		};
		if ('requestIdleCallback' in window) {
			const id = requestIdleCallback(detect, { timeout: 1500 });
			return () => {
				live = false;
				cancelIdleCallback(id);
			};
		}
		const id = setTimeout(detect, 300);
		return () => {
			live = false;
			clearTimeout(id);
		};
	}, []);

	const features: [string, boolean | string][] = caps
		? [
				[m.feature_webcodecs(), caps.webCodecs],
				[m.feature_isolation(), caps.crossOriginIsolated],
				[m.feature_webgl2(), caps.webgl2],
				[m.feature_offscreen(), caps.offscreenCanvas],
				[m.feature_save_picker(), caps.savePicker],
				[m.feature_opfs(), caps.opfs],
				[m.feature_wasm_simd(), caps.wasmSimd],
				[m.feature_wasm_threads(), caps.wasmThreads],
				[m.feature_core(), caps.coreVersion ?? false],
			]
		: [];

	return (
		<div className="flex min-h-full flex-col">
			<SiteHeader />
			<main className="mx-auto grid min-h-svh w-full max-w-[76rem] flex-1 content-start gap-12 px-[clamp(1rem,4vw,2.5rem)] pt-[clamp(3rem,7vw,5rem)]">
				<div className="grid gap-3.5">
					<h1 className="max-w-[18ch] text-[clamp(2.25rem,5vw,3.5rem)] leading-[1.02] font-bold tracking-[-0.045em] text-balance">
						{m.system_title()}
					</h1>
					<p className="text-lead text-muted max-w-[52ch]">{m.system_lede()}</p>
				</div>

				{caps ? (
					<div className="grid gap-12 lg:grid-cols-3">
						<section className="grid content-start gap-4">
							<h2 className="text-title font-bold tracking-[-0.03em]">{m.system_features()}</h2>
							<dl className="text-body grid">
								{features.map(([label, value]) => (
									<div
										key={label}
										className="border-line grid grid-cols-[minmax(0,1fr)_auto] gap-4 border-b py-2.5"
									>
										<dt className="text-ink-2">{label}</dt>
										<dd>
											{typeof value === 'string' ? (
												<span className="text-caption font-mono">{value}</span>
											) : (
												<State ok={value} />
											)}
										</dd>
									</div>
								))}
							</dl>
						</section>
						<CodecTable title={m.system_video_codecs()} codecs={caps.video} />
						<CodecTable title={m.system_audio_codecs()} codecs={caps.audio} />
					</div>
				) : (
					<p className="text-body text-muted">{m.system_checking()}</p>
				)}
			</main>
			<SiteFooter />
		</div>
	);
}

export const Route = createFileRoute('/system')({ component: SystemScreen });
