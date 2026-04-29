export const FULLSCREEN_VERTEX = /* glsl */ `#version 300 es
in vec2 a_position;
in vec2 a_texcoord;
out vec2 v_uv;
void main() {
	v_uv = a_texcoord;
	gl_Position = vec4(a_position, 0.0, 1.0);
}
`;

/**
 * Identity passthrough — used as the fast-path blit when no filters are active.
 * Single texture sample, single draw call. Sub-millisecond on every GPU we target.
 */
export const PASSTHROUGH_FRAGMENT = /* glsl */ `#version 300 es
precision highp float;

in vec2 v_uv;
out vec4 fragColor;
uniform sampler2D u_texture;

void main() {
	fragColor = texture(u_texture, v_uv);
}
`;

/**
 * Single-pass color shader handling all non-blur adjustments.
 *
 * Pipeline order (matters):
 *   1. Decode sRGB → linear-light (so exposure / highlights / shadows behave physically).
 *   2. Exposure (linear multiply).
 *   3. Highlights / Shadows — luminance-masked, gentle gain.
 *   4. Brightness (legacy additive, applied in linear).
 *   5. Re-encode linear → sRGB for perceptual ops.
 *   6. Contrast (around mid-grey).
 *   7. Temperature / Tint (channel-pair shifts).
 *   8. Saturation (around Rec.709 luminance).
 *   9. Hue rotation (HSL space, only when needed).
 *  10. Sepia (mix toward sepia matrix).
 *  11. Vignette (radial darkening, aspect-corrected).
 *  12. Grain (deterministic spatial noise — no flicker on stills).
 */
export const COLOR_FRAGMENT = /* glsl */ `#version 300 es
precision highp float;

in vec2 v_uv;
out vec4 fragColor;

uniform sampler2D u_texture;
uniform float u_exposure;
uniform float u_brightness;
uniform float u_contrast;
uniform float u_highlights;
uniform float u_shadows;
uniform float u_saturation;
uniform float u_temperature;
uniform float u_tint;
uniform float u_hue;
uniform float u_sepia;
uniform float u_vignette;
uniform float u_grain;
uniform vec2 u_resolution;

const vec3 LUMA = vec3(0.2126, 0.7152, 0.0722);

vec3 srgbToLinear(vec3 c) {
	vec3 lo = c / 12.92;
	vec3 hi = pow((max(c, vec3(0.0)) + 0.055) / 1.055, vec3(2.4));
	return mix(lo, hi, step(vec3(0.04045), c));
}

vec3 linearToSrgb(vec3 c) {
	c = max(c, vec3(0.0));
	vec3 lo = c * 12.92;
	vec3 hi = 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055;
	return mix(lo, hi, step(vec3(0.0031308), c));
}

// Interleaved gradient noise (Jimenez) — deterministic, screen-space.
float ign(vec2 p) {
	return fract(52.9829189 * fract(0.06711056 * p.x + 0.00583715 * p.y));
}

vec3 rgb2hsl(vec3 c) {
	float mx = max(c.r, max(c.g, c.b));
	float mn = min(c.r, min(c.g, c.b));
	float l = (mx + mn) * 0.5;
	if (mx == mn) return vec3(0.0, 0.0, l);
	float d = mx - mn;
	float s = l > 0.5 ? d / (2.0 - mx - mn) : d / (mx + mn);
	float h;
	if (mx == c.r) h = (c.g - c.b) / d + (c.g < c.b ? 6.0 : 0.0);
	else if (mx == c.g) h = (c.b - c.r) / d + 2.0;
	else h = (c.r - c.g) / d + 4.0;
	return vec3(h / 6.0, s, l);
}

float hue2rgb(float p, float q, float t) {
	if (t < 0.0) t += 1.0;
	if (t > 1.0) t -= 1.0;
	if (t < 1.0 / 6.0) return p + (q - p) * 6.0 * t;
	if (t < 0.5) return q;
	if (t < 2.0 / 3.0) return p + (q - p) * (2.0 / 3.0 - t) * 6.0;
	return p;
}

vec3 hsl2rgb(vec3 hsl) {
	if (hsl.y == 0.0) return vec3(hsl.z);
	float q = hsl.z < 0.5 ? hsl.z * (1.0 + hsl.y) : hsl.z + hsl.y - hsl.z * hsl.y;
	float p = 2.0 * hsl.z - q;
	return vec3(
		hue2rgb(p, q, hsl.x + 1.0 / 3.0),
		hue2rgb(p, q, hsl.x),
		hue2rgb(p, q, hsl.x - 1.0 / 3.0)
	);
}

void main() {
	vec4 texel = texture(u_texture, v_uv);
	vec3 lin = srgbToLinear(texel.rgb);

	// Exposure in linear
	lin *= u_exposure;

	// Luminance for masking (in linear)
	float L = dot(lin, LUMA);
	// Perceptual proxy for masking thresholds
	float Lp = pow(clamp(L, 0.0, 16.0), 1.0 / 2.2);

	// Highlights: smoothly recover or compress bright tones
	float hMask = smoothstep(0.5, 1.0, Lp);
	lin += lin * (u_highlights * 0.6 * hMask);

	// Shadows: lift or crush dark tones (additive in linear)
	float sMask = 1.0 - smoothstep(0.0, 0.5, Lp);
	lin += vec3(u_shadows * 0.25) * sMask;

	// Brightness (legacy additive — kept for preset back-compat)
	lin += vec3(u_brightness);

	// Back to sRGB for perception-based ops
	vec3 c = linearToSrgb(max(lin, vec3(0.0)));

	// Contrast around mid-grey
	c = (c - 0.5) * u_contrast + 0.5;

	// Temperature: warm shifts R+ / B-
	c.r += u_temperature * 0.10;
	c.b -= u_temperature * 0.10;
	// Tint: magenta (positive) shifts R+ / B+ / G-
	c.r += u_tint * 0.05;
	c.b += u_tint * 0.05;
	c.g -= u_tint * 0.10;

	// Saturation around Rec.709 luminance
	float gray = dot(c, LUMA);
	c = mix(vec3(gray), c, u_saturation);

	// Hue rotation (HSL) — skip when not used to save the conversion cost
	if (abs(u_hue) > 0.0001) {
		vec3 hsl = rgb2hsl(clamp(c, 0.0, 1.0));
		hsl.x = fract(hsl.x + u_hue / 360.0);
		c = hsl2rgb(hsl);
	}

	// Sepia
	if (u_sepia > 0.0) {
		vec3 sepiaC = vec3(
			dot(c, vec3(0.393, 0.769, 0.189)),
			dot(c, vec3(0.349, 0.686, 0.168)),
			dot(c, vec3(0.272, 0.534, 0.131))
		);
		c = mix(c, sepiaC, u_sepia);
	}

	// Vignette (aspect-corrected radial darkening, soft falloff)
	if (u_vignette > 0.0) {
		vec2 uv = v_uv * 2.0 - 1.0;
		float aspect = u_resolution.x / u_resolution.y;
		uv.x *= aspect;
		float dist = length(uv);
		float vig = 1.0 - smoothstep(0.4, 1.4, dist) * u_vignette;
		c *= vig;
	}

	// Grain — deterministic spatial noise so still images don't shimmer.
	if (u_grain > 0.0) {
		float n = ign(gl_FragCoord.xy) - 0.5;
		c += n * (u_grain * 0.01);
	}

	fragColor = vec4(clamp(c, 0.0, 1.0), texel.a);
}
`;

/**
 * Separable Gaussian blur — 9-tap unrolled, used for both H and V passes.
 * Only invoked when blur radius > 0.
 */
export const BLUR_FRAGMENT = /* glsl */ `#version 300 es
precision highp float;

in vec2 v_uv;
out vec4 fragColor;

uniform sampler2D u_texture;
uniform vec2 u_direction;
uniform float u_radius;

void main() {
	float w0 = 0.2270270270;
	float w1 = 0.1945945946;
	float w2 = 0.1216216216;
	float w3 = 0.0540540541;
	float w4 = 0.0162162162;

	vec2 d1 = u_direction * u_radius;
	vec2 d2 = d1 * 2.0;
	vec2 d3 = d1 * 3.0;
	vec2 d4 = d1 * 4.0;

	vec4 result = texture(u_texture, v_uv) * w0;
	result += texture(u_texture, v_uv + d1) * w1;
	result += texture(u_texture, v_uv - d1) * w1;
	result += texture(u_texture, v_uv + d2) * w2;
	result += texture(u_texture, v_uv - d2) * w2;
	result += texture(u_texture, v_uv + d3) * w3;
	result += texture(u_texture, v_uv - d3) * w3;
	result += texture(u_texture, v_uv + d4) * w4;
	result += texture(u_texture, v_uv - d4) * w4;
	fragColor = result;
}
`;

/**
 * Side-by-side compare shader — kept available for split-view UIs.
 */
export const COMPARE_FRAGMENT = /* glsl */ `#version 300 es
precision highp float;

in vec2 v_uv;
out vec4 fragColor;

uniform sampler2D u_original;
uniform sampler2D u_filtered;
uniform float u_split;

void main() {
	fragColor = v_uv.x < u_split
		? texture(u_original, v_uv)
		: texture(u_filtered, v_uv);
}
`;
