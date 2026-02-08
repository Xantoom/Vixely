import initWasm, { apply_filters } from "@/wasm/vixely_core.js";

// ── Types (mirrored from stores/imageEditor.ts) ──

interface Filters {
	exposure: number;
	brightness: number;
	contrast: number;
	highlights: number;
	shadows: number;
	saturation: number;
	temperature: number;
	tint: number;
	hue: number;
	blur: number;
	sepia: number;
	vignette: number;
	grain: number;
}

interface ProcessMessage {
	type: "PROCESS";
	pixels: ArrayBuffer;
	width: number;
	height: number;
	filters: Filters;
}

type WorkerMessage = { type: "INIT" } | ProcessMessage;

// ── WASM state ──

let wasmReady = false;

// ── Extended Filters (runs in worker thread — no main-thread blocking) ──

function applyExtendedFilters(pixels: Uint8ClampedArray, filters: Filters): void {
	const { exposure, highlights, shadows, temperature, tint, hue, sepia } = filters;

	const needsExtended =
		exposure !== 1 ||
		highlights !== 0 ||
		shadows !== 0 ||
		temperature !== 0 ||
		tint !== 0 ||
		hue !== 0 ||
		sepia !== 0;

	if (!needsExtended) return;

	const hueRad = (hue * Math.PI) / 180;
	const cosH = Math.cos(hueRad);
	const sinH = Math.sin(hueRad);

	for (let i = 0; i < pixels.length; i += 4) {
		let r = pixels[i]! / 255;
		let g = pixels[i + 1]! / 255;
		let b = pixels[i + 2]! / 255;

		if (exposure !== 1) {
			r *= exposure;
			g *= exposure;
			b *= exposure;
		}

		if (highlights !== 0 || shadows !== 0) {
			const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
			if (highlights !== 0 && lum > 0.5) {
				const t = (lum - 0.5) * 2;
				const adj = highlights * t * 0.5;
				r += adj;
				g += adj;
				b += adj;
			}
			if (shadows !== 0 && lum < 0.5) {
				const t = (0.5 - lum) * 2;
				const adj = shadows * t * 0.5;
				r += adj;
				g += adj;
				b += adj;
			}
		}

		if (temperature !== 0) {
			r += temperature * 0.1;
			b -= temperature * 0.1;
		}

		if (tint !== 0) {
			g += tint * 0.1;
		}

		if (hue !== 0) {
			const rr = r;
			const gg = g;
			const bb = b;
			r = (0.213 + 0.787 * cosH - 0.213 * sinH) * rr +
				(0.715 - 0.715 * cosH - 0.715 * sinH) * gg +
				(0.072 - 0.072 * cosH + 0.928 * sinH) * bb;
			g = (0.213 - 0.213 * cosH + 0.143 * sinH) * rr +
				(0.715 + 0.285 * cosH + 0.140 * sinH) * gg +
				(0.072 - 0.072 * cosH - 0.283 * sinH) * bb;
			b = (0.213 - 0.213 * cosH - 0.787 * sinH) * rr +
				(0.715 - 0.715 * cosH + 0.715 * sinH) * gg +
				(0.072 + 0.928 * cosH + 0.072 * sinH) * bb;
		}

		if (sepia !== 0) {
			const sr = 0.393 * r + 0.769 * g + 0.189 * b;
			const sg = 0.349 * r + 0.686 * g + 0.168 * b;
			const sb = 0.272 * r + 0.534 * g + 0.131 * b;
			r = r + (sr - r) * sepia;
			g = g + (sg - g) * sepia;
			b = b + (sb - b) * sepia;
		}

		pixels[i] = Math.max(0, Math.min(255, Math.round(r * 255)));
		pixels[i + 1] = Math.max(0, Math.min(255, Math.round(g * 255)));
		pixels[i + 2] = Math.max(0, Math.min(255, Math.round(b * 255)));
	}
}

// ── Message Handler ──

self.onmessage = async (e: MessageEvent<WorkerMessage>) => {
	const msg = e.data;

	if (msg.type === "INIT") {
		try {
			await initWasm();
			wasmReady = true;
			self.postMessage({ type: "READY" });
		} catch (err) {
			self.postMessage({ type: "ERROR", error: String(err) });
		}
		return;
	}

	if (msg.type === "PROCESS") {
		if (!wasmReady) {
			self.postMessage({ type: "ERROR", error: "WASM not initialized" });
			return;
		}

		try {
			const { pixels: buffer, width, height, filters } = msg;
			const u8 = new Uint8Array(buffer);

			// Step 1: WASM core filters (brightness, contrast, saturation)
			apply_filters(u8, filters.brightness, filters.contrast, filters.saturation);

			// Step 2: Extended JS filters (exposure, highlights, shadows, etc.)
			const clamped = new Uint8ClampedArray(u8.buffer);
			applyExtendedFilters(clamped, filters);

			// Transfer buffer back (zero-copy)
			self.postMessage(
				{ type: "DONE", pixels: clamped.buffer, width, height },
				[clamped.buffer],
			);
		} catch (err) {
			self.postMessage({ type: "ERROR", error: String(err) });
		}
	}
};
