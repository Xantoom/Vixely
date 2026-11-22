/**
 * The graphics card, and the name of the video encoder the browser reaches through it. Browsers
 * encode on the graphics card whenever they can, through the system: on Windows, Media
 * Foundation hands the work to NVIDIA's NVENC, Intel's Quick Sync (QSV) or AMD's AMF; macOS has
 * VideoToolbox, Linux VA-API. Which codecs the card encodes is asked of the browser itself: this
 * only names what it uses, so people know what they are choosing.
 */

export type GpuVendor = 'nvidia' | 'amd' | 'intel' | 'apple' | 'qualcomm' | 'arm' | 'other';

export interface Gpu {
	vendor: GpuVendor;
	/** The card's model, such as `GeForce RTX 4070`; null when the browser hides it. */
	name: string | null;
	/** The system encoder it is used through, such as `NVENC`. */
	encoder: string;
}

const VENDORS: [RegExp, GpuVendor][] = [
	[/nvidia|geforce|quadro|tesla/i, 'nvidia'],
	[/\bamd\b|radeon|advanced micro devices|\bati\b/i, 'amd'],
	[/intel/i, 'intel'],
	[/apple/i, 'apple'],
	[/qualcomm|adreno/i, 'qualcomm'],
	[/\barm\b|mali/i, 'arm'],
];

/** Renderers that draw without a graphics card. */
const SOFTWARE = /swiftshader|llvmpipe|softpipe|microsoft basic render|software/i;

export function vendorOf(text: string): GpuVendor {
	return VENDORS.find(([pattern]) => pattern.test(text))?.[1] ?? 'other';
}

/**
 * The model in a WebGL renderer string, which Chromium wraps in ANGLE's details:
 * `ANGLE (NVIDIA, NVIDIA GeForce RTX 4070 (0x00002786) Direct3D11 vs_5_0 ps_5_0, D3D11)`.
 */
export function modelOf(renderer: string): string {
	const angle = /^ANGLE \((?:[^,]*), (.+)\)$/.exec(renderer.trim());
	let name = angle?.[1] ?? renderer;
	// Device ids, graphics APIs and the driver's version come after the model.
	name = name.split(/ \(0x[0-9a-f]+\)| Direct3D|, OpenGL|, Vulkan|, Unspecified Version|, Metal/i)[0] ?? name;
	return (
		name
			.replace(/^ANGLE Metal Renderer: /, '')
			.replace(/\/PCIe\/SSE2$/, '')
			.replace(/\((R|TM)\)/gi, '')
			// GeForce and Radeon name their maker already.
			.replace(/^(NVIDIA|AMD)\s+(?=GeForce|Radeon|Quadro)/i, '')
			.replace(/\s+/g, ' ')
			.trim()
	);
}

type Platform = 'windows' | 'mac' | 'linux' | 'android' | 'other';

function platform(): Platform {
	// Chromium names the system without the user agent's leftovers; others only have the latter.
	const data: unknown = Reflect.get(navigator, 'userAgentData');
	const named: unknown = typeof data === 'object' && data !== null ? Reflect.get(data, 'platform') : null;
	const text = `${typeof named === 'string' ? named : ''} ${navigator.userAgent}`;
	if (/android/i.test(text)) return 'android';
	if (/windows/i.test(text)) return 'windows';
	if (/mac ?os|macintosh|iphone|ipad/i.test(text)) return 'mac';
	if (/linux|cros|chrome os/i.test(text)) return 'linux';
	return 'other';
}

/** The system encoder a browser reaches a card through. */
export function encoderName(vendor: GpuVendor, system: Platform): string {
	if (system === 'mac') return 'VideoToolbox';
	if (system === 'android') return 'MediaCodec';
	if (system === 'linux') return 'VA-API';
	if (vendor === 'nvidia') return 'NVENC';
	if (vendor === 'intel') return 'QSV';
	if (vendor === 'amd') return 'AMF';
	return 'Media Foundation';
}

function webglRenderer(): string | null {
	try {
		const gl = document.createElement('canvas').getContext('webgl');
		if (!gl) return null;
		const debug = gl.getExtension('WEBGL_debug_renderer_info');
		const renderer: unknown = gl.getParameter(debug ? debug.UNMASKED_RENDERER_WEBGL : gl.RENDERER);
		gl.getExtension('WEBGL_lose_context')?.loseContext();
		return typeof renderer === 'string' ? renderer : null;
	} catch {
		return null;
	}
}

interface GpuAdapterInfo {
	vendor?: string;
	description?: string;
}

async function webgpuInfo(): Promise<GpuAdapterInfo | null> {
	try {
		const gpu = (navigator as { gpu?: { requestAdapter: () => Promise<{ info?: GpuAdapterInfo } | null> } }).gpu;
		const adapter = await gpu?.requestAdapter();
		return adapter?.info ?? null;
	} catch {
		return null;
	}
}

let detecting: Promise<Gpu | null> | null = null;

/** The graphics card the browser draws with; null when it draws without one. */
export async function detectGpu(): Promise<Gpu | null> {
	detecting ??= (async () => {
		const renderer = webglRenderer();
		if (renderer && SOFTWARE.test(renderer)) return null;
		const info = renderer ? null : await webgpuInfo();
		const text = renderer ?? `${info?.vendor ?? ''} ${info?.description ?? ''}`;
		if (!text.trim()) return null;
		const vendor = vendorOf(text);
		const model = renderer ? modelOf(renderer) : (info?.description ?? '');
		return { vendor, name: model || null, encoder: encoderName(vendor, platform()) };
	})();
	return detecting;
}
