import { createFileRoute } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { AppBar } from '@/app/AppBar';
import { codecName } from '@/lib/format';
import { type Capabilities, type CodecSupport, detectCapabilities } from '@/media/capabilities';
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
							<td className="py-2.5 font-mono text-[12.5px]">{codecName(codec.codec)}</td>
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
		void detectCapabilities().then(setCaps);
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
			<AppBar />
			<main className="mx-auto grid w-full max-w-[1100px] content-start gap-12 px-5 py-10 sm:px-10 sm:py-16">
				<div className="grid gap-3.5">
					<h1 className="text-display max-w-[18ch] font-bold tracking-[-0.045em] text-balance">
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
												<span className="font-mono text-[12.5px]">{value}</span>
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
		</div>
	);
}

export const Route = createFileRoute('/system')({ component: SystemScreen });
