import { describe, expect, it } from 'vitest';
import { encoderName, modelOf, vendorOf } from './gpu';

describe('graphics cards', () => {
	it('reads the model out of WebGL renderer strings', () => {
		expect(modelOf('ANGLE (NVIDIA, NVIDIA GeForce RTX 4070 (0x00002786) Direct3D11 vs_5_0 ps_5_0, D3D11)')).toBe(
			'GeForce RTX 4070',
		);
		expect(modelOf('ANGLE (Intel, Intel(R) UHD Graphics 620 (0x00005917) Direct3D11 vs_5_0 ps_5_0, D3D11)')).toBe(
			'Intel UHD Graphics 620',
		);
		expect(modelOf('ANGLE (NVIDIA Corporation, NVIDIA GeForce RTX 3060/PCIe/SSE2, OpenGL 4.5.0)')).toBe(
			'GeForce RTX 3060',
		);
		expect(modelOf('ANGLE (Apple, ANGLE Metal Renderer: Apple M2, Unspecified Version)')).toBe('Apple M2');
		expect(modelOf('AMD Radeon RX 7800 XT')).toBe('Radeon RX 7800 XT');
	});

	it('names the encoder each card is used through', () => {
		expect(vendorOf('ANGLE (AMD, AMD Radeon RX 7800 XT (0x0000747e) Direct3D11')).toBe('amd');
		expect(vendorOf('Mesa Intel(R) Graphics (ADL GT2)')).toBe('intel');
		expect(encoderName('nvidia', 'windows')).toBe('NVENC');
		expect(encoderName('intel', 'windows')).toBe('QSV');
		expect(encoderName('amd', 'windows')).toBe('AMF');
		expect(encoderName('nvidia', 'mac')).toBe('VideoToolbox');
		expect(encoderName('intel', 'linux')).toBe('VA-API');
	});
});
