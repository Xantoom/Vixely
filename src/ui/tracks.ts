/**
 * Slider tracks that show what a setting does, from its lowest to its highest value. The same
 * colours in both themes: they describe the picture, not the interface.
 */
export const TRACKS = {
	light: 'linear-gradient(90deg, #16171b, #8b8d94 50%, #ffffff)',
	temperature: 'linear-gradient(90deg, #2f7bff, #c9cbd1 50%, #ffa21f)',
	tint: 'linear-gradient(90deg, #1fbf5c, #c9cbd1 50%, #e33ad6)',
	saturation: 'linear-gradient(90deg, #8e8e8e, #b9a3a3 35%, #ff5a3d 65%, #ff2f7a 82%, #3d7bff)',
	hue: 'linear-gradient(90deg, #00e5ff, #2f5bff 17%, #b44bff 33%, #ff2f2f 50%, #ffc21f 67%, #3ddc4a 83%, #00e5ff)',
	sepia: 'linear-gradient(90deg, #9a9ca3, #a07443)',
	vignette: 'linear-gradient(90deg, #ffffff, #c9cbd1 50%, #101114)',
	shadows: 'linear-gradient(90deg, #050506, #6b6d74)',
	highlights: 'linear-gradient(90deg, #9a9ca3, #ffffff)',
} as const;
