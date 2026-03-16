const MAX_ATTEMPTS = 3;

export interface SizeConstrainedExportResult {
	data: Uint8Array;
	finalSizeBytes: number;
	attempts: number;
	withinLimit: boolean;
}

interface ResolutionStep {
	width: number;
	height: number;
}

export interface SizeConstrainedExportOptions {
	transcode: (args: string[]) => Promise<Uint8Array>;
	baseArgs: string[];
	maxSizeBytes: number;
	targetVideoBitrateKbps: number;
	/** Current resolution used in the first attempt (from selectOptimalResolution or source). */
	currentResolution?: ResolutionStep | null;
	/** Next lower resolution step to try on retry 2 (if available). */
	fallbackResolution?: ResolutionStep | null;
	onAttempt?: (attempt: number, bitrateKbps: number, resolution?: ResolutionStep) => void;
}

function replaceBitrateArg(args: string[], newBitrateBps: number): string[] {
	const updated = [...args];
	const idx = updated.indexOf('-b:v');
	if (idx !== -1 && idx + 1 < updated.length) {
		updated[idx + 1] = String(Math.round(newBitrateBps));
	}
	return updated;
}

function replaceOrAddScaleArg(args: string[], width: number, height: number): string[] {
	const updated = [...args];
	const vfIdx = updated.indexOf('-vf');

	const scaleValue = `scale=${width}:${height}:force_original_aspect_ratio=decrease`;

	if (vfIdx !== -1 && vfIdx + 1 < updated.length) {
		const existing = updated[vfIdx + 1]!;
		// Replace existing scale filter or prepend
		if (/scale=\d+:\d+/.test(existing)) {
			updated[vfIdx + 1] = existing.replace(/scale=\d+:\d+[^,]*/, scaleValue);
		} else {
			updated[vfIdx + 1] = `${scaleValue},${existing}`;
		}
	} else {
		updated.push('-vf', scaleValue);
	}
	return updated;
}

export async function sizeConstrainedExport(
	options: SizeConstrainedExportOptions,
): Promise<SizeConstrainedExportResult> {
	const {
		transcode,
		baseArgs,
		maxSizeBytes,
		targetVideoBitrateKbps,
		currentResolution,
		fallbackResolution,
		onAttempt,
	} = options;

	let currentBitrateKbps = targetVideoBitrateKbps;
	let currentArgs = baseArgs;
	let lastResult: Uint8Array | null = null;
	let usedFallbackResolution = false;

	let attempt = 1;
	while (attempt <= MAX_ATTEMPTS) {
		onAttempt?.(
			attempt,
			Math.round(currentBitrateKbps),
			usedFallbackResolution ? (fallbackResolution ?? undefined) : (currentResolution ?? undefined),
		);

		// eslint-disable-next-line no-await-in-loop
		const result = await transcode(currentArgs);
		lastResult = result;

		if (result.byteLength <= maxSizeBytes) {
			return { data: result, finalSizeBytes: result.byteLength, attempts: attempt, withinLimit: true };
		}

		// Last attempt — don't retry
		if (attempt === MAX_ATTEMPTS) break;

		// Reduce bitrate proportionally to how much we overshot
		const overshootRatio = result.byteLength / maxSizeBytes;
		const retryMargin = attempt === 1 ? 0.92 : 0.85;
		currentBitrateKbps = Math.max(64, (currentBitrateKbps / overshootRatio) * retryMargin);
		currentArgs = replaceBitrateArg(baseArgs, currentBitrateKbps * 1000);

		// On retry 2, also step down resolution if a fallback is available
		if (attempt === 2 && fallbackResolution && !usedFallbackResolution) {
			currentArgs = replaceOrAddScaleArg(currentArgs, fallbackResolution.width, fallbackResolution.height);
			usedFallbackResolution = true;
		}

		attempt++;
	}

	return { data: lastResult!, finalSizeBytes: lastResult!.byteLength, attempts: MAX_ATTEMPTS, withinLimit: false };
}
