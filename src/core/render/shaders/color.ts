/**
 * One mega-shader for the whole colour correction chain.
 *
 * Chaining a pass per adjustment would cost a framebuffer round trip for
 * nothing. Every uniform is neutral at its default, so the same shader is a
 * pure copy when nothing is adjusted — which is what keeps the pipeline
 * unconditional and removes the `hasFilters` branch that produced the
 * double-application bug in the previous iteration.
 */
export const COLOR_FRAGMENT_SHADER = /* glsl */ `#version 300 es
precision highp float;

in vec2 v_uv;
out vec4 outColor;

uniform sampler2D u_texture;
uniform vec2 u_texelSize;

uniform float u_brightness;
uniform float u_contrast;
uniform float u_saturation;
uniform float u_exposure;
uniform float u_temperature;
uniform float u_tint;
uniform float u_gamma;
uniform float u_highlights;
uniform float u_shadows;
uniform float u_vibrance;
uniform float u_hueRotate;
uniform float u_sharpen;
uniform float u_blur;
uniform float u_vignette;
uniform float u_grayscale;
uniform float u_sepia;
uniform float u_invert;
uniform float u_opacity;

const vec3 LUMA = vec3(0.2126, 0.7152, 0.0722);

vec3 applyHueRotation(vec3 color, float degrees) {
	float angle = radians(degrees);
	float c = cos(angle);
	float s = sin(angle);
	mat3 matrix = mat3(
		0.213 + c * 0.787 - s * 0.213, 0.213 - c * 0.213 + s * 0.143, 0.213 - c * 0.213 - s * 0.787,
		0.715 - c * 0.715 - s * 0.715, 0.715 + c * 0.285 + s * 0.140, 0.715 - c * 0.715 + s * 0.715,
		0.072 - c * 0.072 + s * 0.928, 0.072 - c * 0.072 - s * 0.283, 0.072 + c * 0.928 + s * 0.072
	);
	return matrix * color;
}

vec4 sampleBlurred(vec2 uv) {
	if (u_blur <= 0.0) {
		return texture(u_texture, uv);
	}
	// Nine-tap tent kernel; radius is expressed in source pixels.
	vec2 offset = u_texelSize * u_blur;
	vec4 sum = texture(u_texture, uv) * 4.0;
	sum += texture(u_texture, uv + vec2(offset.x, 0.0)) * 2.0;
	sum += texture(u_texture, uv - vec2(offset.x, 0.0)) * 2.0;
	sum += texture(u_texture, uv + vec2(0.0, offset.y)) * 2.0;
	sum += texture(u_texture, uv - vec2(0.0, offset.y)) * 2.0;
	sum += texture(u_texture, uv + offset);
	sum += texture(u_texture, uv - offset);
	sum += texture(u_texture, uv + vec2(offset.x, -offset.y));
	sum += texture(u_texture, uv + vec2(-offset.x, offset.y));
	return sum / 16.0;
}

void main() {
	vec4 texel = sampleBlurred(v_uv);
	vec3 color = texel.rgb;

	if (u_sharpen > 0.0) {
		vec3 neighbours =
			texture(u_texture, v_uv + vec2(u_texelSize.x, 0.0)).rgb +
			texture(u_texture, v_uv - vec2(u_texelSize.x, 0.0)).rgb +
			texture(u_texture, v_uv + vec2(0.0, u_texelSize.y)).rgb +
			texture(u_texture, v_uv - vec2(0.0, u_texelSize.y)).rgb;
		color += (color * 4.0 - neighbours) * u_sharpen * 0.25;
	}

	color *= exp2(u_exposure);
	color += u_brightness;

	// Temperature and tint as opposing channel shifts, kept subtle.
	color.r += u_temperature * 0.12;
	color.b -= u_temperature * 0.12;
	color.g += u_tint * 0.12;
	color.r -= u_tint * 0.06;
	color.b -= u_tint * 0.06;

	color = clamp(color, 0.0, 1.0);

	float luminance = dot(color, LUMA);
	if (u_shadows != 0.0) {
		float weight = 1.0 - smoothstep(0.0, 0.5, luminance);
		color += u_shadows * weight * 0.5;
	}
	if (u_highlights != 0.0) {
		float weight = smoothstep(0.5, 1.0, luminance);
		color += u_highlights * weight * 0.5;
	}

	color = (color - 0.5) * (1.0 + u_contrast) + 0.5;

	luminance = dot(clamp(color, 0.0, 1.0), LUMA);
	color = mix(vec3(luminance), color, 1.0 + u_saturation);

	if (u_vibrance != 0.0) {
		float maxChannel = max(color.r, max(color.g, color.b));
		float minChannel = min(color.r, min(color.g, color.b));
		float chroma = maxChannel - minChannel;
		color = mix(vec3(luminance), color, 1.0 + u_vibrance * (1.0 - chroma));
	}

	if (u_hueRotate != 0.0) {
		color = applyHueRotation(color, u_hueRotate);
	}

	color = clamp(color, 0.0, 1.0);

	if (u_gamma != 1.0) {
		color = pow(color, vec3(1.0 / u_gamma));
	}

	if (u_grayscale > 0.0) {
		color = mix(color, vec3(dot(color, LUMA)), u_grayscale);
	}

	if (u_sepia > 0.0) {
		vec3 sepia = vec3(
			dot(color, vec3(0.393, 0.769, 0.189)),
			dot(color, vec3(0.349, 0.686, 0.168)),
			dot(color, vec3(0.272, 0.534, 0.131))
		);
		color = mix(color, clamp(sepia, 0.0, 1.0), u_sepia);
	}

	if (u_invert > 0.0) {
		color = mix(color, 1.0 - color, u_invert);
	}

	if (u_vignette > 0.0) {
		vec2 centred = v_uv - 0.5;
		float falloff = smoothstep(0.75, 0.25, length(centred) * 1.414);
		color *= mix(1.0, falloff, u_vignette);
	}

	outColor = vec4(clamp(color, 0.0, 1.0), texel.a * u_opacity);
}
`;

/**
 * Geometry is done in the vertex stage: crop selects the sampled rectangle,
 * rotation and flips are a matrix on the UVs. No copy pass for either.
 */
export const QUAD_VERTEX_SHADER = /* glsl */ `#version 300 es
precision highp float;

in vec2 a_position;
out vec2 v_uv;

uniform mat3 u_uvTransform;
uniform vec2 u_flipOutput;

void main() {
	vec2 uv = a_position * 0.5 + 0.5;
	v_uv = (u_uvTransform * vec3(uv, 1.0)).xy;
	gl_Position = vec4(a_position * u_flipOutput, 0.0, 1.0);
}
`;

/** Straight copy, used for the overlay composite. */
export const COMPOSITE_FRAGMENT_SHADER = /* glsl */ `#version 300 es
precision highp float;

in vec2 v_uv;
out vec4 outColor;

uniform sampler2D u_texture;
uniform float u_alpha;

void main() {
	vec4 texel = texture(u_texture, v_uv);
	outColor = vec4(texel.rgb, texel.a * u_alpha);
}
`;
