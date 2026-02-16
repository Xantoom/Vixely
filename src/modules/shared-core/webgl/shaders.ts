export const FULLSCREEN_VERTEX = /* glsl */ `#version 300 es
layout(location = 0) in vec2 a_position;
layout(location = 1) in vec2 a_texcoord;
out vec2 v_uv;
void main() {
	v_uv = a_texcoord;
	gl_Position = vec4(a_position, 0.0, 1.0);
}
`;

/**
 * Single-pass color correction fragment shader.
 * Handles: exposure, brightness, contrast, highlights, shadows,
 * saturation, temperature, tint, hue rotation, sepia, vignette.
 */
export const COLOR_CORRECTION_FRAGMENT = /* glsl */ `#version 300 es
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
uniform vec2 u_resolution;

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
	vec3 color = texel.rgb;

	// Exposure (multiplicative)
	color *= u_exposure;

	// Brightness (additive)
	color += u_brightness;

	// Contrast (around midpoint 0.5)
	color = (color - 0.5) * u_contrast + 0.5;

	// Highlights / Shadows
	float lum = dot(color, vec3(0.2126, 0.7152, 0.0722));
	float highlightMask = smoothstep(0.5, 1.0, lum);
	float shadowMask = 1.0 - smoothstep(0.0, 0.5, lum);
	color += u_highlights * highlightMask;
	color += u_shadows * shadowMask;

	// Temperature (warm=positive, cool=negative)
	color.r += u_temperature * 0.1;
	color.b -= u_temperature * 0.1;

	// Tint (green-magenta axis)
	color.g += u_tint * 0.1;

	// Saturation
	float gray = dot(color, vec3(0.2126, 0.7152, 0.0722));
	color = mix(vec3(gray), color, u_saturation);

	// Hue rotation
	if (u_hue != 0.0) {
		vec3 hsl = rgb2hsl(clamp(color, 0.0, 1.0));
		hsl.x = fract(hsl.x + u_hue / 360.0);
		color = hsl2rgb(hsl);
	}

	// Sepia
	if (u_sepia > 0.0) {
		vec3 sepiaColor = vec3(
			dot(color, vec3(0.393, 0.769, 0.189)),
			dot(color, vec3(0.349, 0.686, 0.168)),
			dot(color, vec3(0.272, 0.534, 0.131))
		);
		color = mix(color, sepiaColor, u_sepia);
	}

	// Vignette
	if (u_vignette > 0.0) {
		vec2 uv = v_uv * 2.0 - 1.0;
		float aspect = u_resolution.x / u_resolution.y;
		uv.x *= aspect;
		float dist = length(uv);
		float vig = 1.0 - smoothstep(1.0 - u_vignette, 1.8, dist);
		color *= vig;
	}

	fragColor = vec4(clamp(color, 0.0, 1.0), texel.a);
}
`;

/**
 * Separable Gaussian blur — horizontal pass.
 * Bind the source texture and set u_direction = vec2(1/width, 0).
 */
export const BLUR_FRAGMENT = /* glsl */ `#version 300 es
precision highp float;

in vec2 v_uv;
out vec4 fragColor;

uniform sampler2D u_texture;
uniform vec2 u_direction;
uniform float u_radius;

void main() {
	if (u_radius <= 0.0) {
		fragColor = texture(u_texture, v_uv);
		return;
	}

	// 9-tap Gaussian approximation
	float weights[5] = float[](0.2270270270, 0.1945945946, 0.1216216216, 0.0540540541, 0.0162162162);

	vec4 result = texture(u_texture, v_uv) * weights[0];
	for (int i = 1; i < 5; i++) {
		vec2 offset = u_direction * float(i) * u_radius;
		result += texture(u_texture, v_uv + offset) * weights[i];
		result += texture(u_texture, v_uv - offset) * weights[i];
	}
	fragColor = result;
}
`;

/**
 * Film grain overlay using pseudo-random noise with time-based seed.
 */
export const GRAIN_FRAGMENT = /* glsl */ `#version 300 es
precision highp float;

in vec2 v_uv;
out vec4 fragColor;

uniform sampler2D u_texture;
uniform float u_grain;
uniform float u_time;

float rand(vec2 co) {
	return fract(sin(dot(co, vec2(12.9898, 78.233))) * 43758.5453);
}

void main() {
	vec4 color = texture(u_texture, v_uv);
	if (u_grain > 0.0) {
		float noise = rand(v_uv + u_time) * 2.0 - 1.0;
		color.rgb += noise * u_grain * 0.15;
		color.rgb = clamp(color.rgb, 0.0, 1.0);
	}
	fragColor = color;
}
`;

/**
 * Compare shader — renders original on left, filtered on right, split at u_split.
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
