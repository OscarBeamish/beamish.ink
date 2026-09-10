#version 300 es
precision highp float;

/*
 * Foil: a hot-foil stamp on paper, lit by the cursor.
 *
 * The stamp is an SDF rosette with a brushed relief pressed into it. The cursor
 * is the light: a point source just above the surface, so moving it rakes the
 * highlight across the foil the way tilting a real foil-stamped card does.
 *
 * There is no texture and no image. The whole thing is the height field, its
 * gradient, and one specular term.
 */

uniform vec2  u_resolution;   // drawing buffer, device px
uniform float u_dpr;
uniform float u_time;
uniform float u_period;
uniform vec2  u_pointer;      // 0..1 across the element, y down
uniform float u_pointerActive;
uniform vec3  u_paper;
uniform vec3  u_foilLow;
uniform vec3  u_foilHigh;
uniform float u_spokes;
uniform float u_scale;
uniform float u_relief;
uniform float u_sharpness;
uniform float u_iridescence;
uniform float u_lightHeight;
uniform float u_grain;

out vec4 fragColor;

const float TAU = 6.28318530718;

float hash12(vec2 p) {
  return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453123);
}

/*
 * The stamp, as a height field in 0..1. Everything the light does is derived
 * from this one function, sampled five times per pixel: once for the mask and
 * four times for the gradient.
 */
float stamp(vec2 p, float spokes, float relief) {
  float r = length(p);
  float a = atan(p.y, p.x);

  // Petal boundary: a circle modulated by a cosine, which is the whole rosette.
  float edge = 0.60 + 0.15 * cos(a * spokes);
  float body = smoothstep(edge, edge - 0.05, r);

  // A hub, so the centre does not collapse where the petals meet.
  float hub = smoothstep(0.21, 0.17, r);

  // A thin ring holding the composition together.
  float ring = smoothstep(0.92, 0.885, r) * smoothstep(0.825, 0.86, r);

  float mask = clamp(max(max(body, hub), ring), 0.0, 1.0);

  // Brushed relief. This is the part the highlight rakes over. Without it the
  // foil is a flat shape that changes brightness, which reads as plastic.
  //
  // The amplitude falls away towards the centre. Radial lines all converge on
  // the origin, and at full strength that convergence is the first thing the eye
  // goes to, which is not what the piece is about.
  float brush = 0.5 + 0.5 * sin(a * spokes * 3.0 + r * 24.0);
  float depth = relief * smoothstep(0.12, 0.42, r);
  return mask * (1.0 - depth * 0.5 + depth * 0.5 * brush);
}

void main() {
  vec2 cssRes = u_resolution / max(u_dpr, 0.001);
  float shortSide = min(cssRes.x, cssRes.y);
  vec2 cssPx = gl_FragCoord.xy / max(u_dpr, 0.001);

  // Origin at the centre, ±1 across the short axis.
  vec2 p = (cssPx - cssRes * 0.5) / (shortSide * 0.5);
  p /= max(u_scale, 0.05);

  // gl_FragCoord counts up from the bottom and the pointer counts down from the
  // top, so one of them has to be flipped. It is always this line that is wrong.
  vec2 pointerPx = vec2(u_pointer.x * cssRes.x, (1.0 - u_pointer.y) * cssRes.y);
  vec2 lightXY = (pointerPx - cssRes * 0.5) / (shortSide * 0.5) / max(u_scale, 0.05);

  // With no pointer the light takes a slow closed orbit, so the effect is alive
  // before anyone touches it and the loop still has no seam.
  float phase = TAU * u_time / max(u_period, 0.001);
  vec2 idle = vec2(cos(phase), sin(phase)) * 0.85;
  lightXY = mix(idle, lightXY, u_pointerActive);

  float height = stamp(p, u_spokes, u_relief);

  // Finite differences in world units rather than screen derivatives, so the
  // relief is the same depth at any resolution or DPR.
  float eps = 2.4 / shortSide / max(u_scale, 0.05);
  float dx = stamp(p + vec2(eps, 0.0), u_spokes, u_relief) - stamp(p - vec2(eps, 0.0), u_spokes, u_relief);
  float dy = stamp(p + vec2(0.0, eps), u_spokes, u_relief) - stamp(p - vec2(0.0, eps), u_spokes, u_relief);
  vec3 normal = normalize(vec3(-dx * 0.55, -dy * 0.55, 2.0 * eps));

  vec3 toLight = normalize(vec3(lightXY - p, max(u_lightHeight, 0.05)));
  vec3 toEye = vec3(0.0, 0.0, 1.0);
  vec3 half3 = normalize(toLight + toEye);
  float ndh = clamp(dot(normal, half3), 0.0, 1.0);
  float ndl = clamp(dot(normal, toLight), 0.0, 1.0);

  float tight = pow(ndh, 8.0 + u_sharpness * 220.0);
  float broad = pow(ndh, 3.0);

  // Metal has almost no diffuse term. The colour comes from the highlight, which
  // is why a foil looks like foil and a matte print does not.
  vec3 foil = mix(u_foilLow, u_foilHigh, smoothstep(0.15, 0.95, ndh));

  // A narrow spectral shift near grazing angles. Restrained on purpose. A full
  // rainbow is a hologram, not a foil.
  float shift = fract(ndh * 1.6 + 0.35);
  vec3 spectral = 0.5 + 0.5 * cos(TAU * (vec3(0.0, 0.28, 0.55) + shift));
  foil = mix(foil, foil * (0.6 + 0.8 * spectral), u_iridescence * (1.0 - ndh) * 0.9);

  foil += vec3(1.0, 0.97, 0.92) * tight * 1.35;
  foil += u_foilHigh * broad * 0.22;
  foil *= 0.48 + 0.52 * ndl;

  // The stamp is pressed into the paper, so it throws a short shadow away from
  // the light. Sampling the height field at an offset is the cheapest honest way
  // to get one.
  vec2 offset = normalize(vec2(lightXY - p) + vec2(1e-5)) * 0.014;
  float under = stamp(p - offset, u_spokes, u_relief);
  float press = clamp(under - height, 0.0, 1.0);

  vec3 col = u_paper * (1.0 - press * 0.22);
  col = mix(col, foil, clamp(height * 1.35, 0.0, 1.0));

  // Paper tooth, static. Animated grain flickers, and a flicker this fine is
  // exactly what WCAG 2.3.1 is about.
  float tooth = hash12(floor(cssPx * 0.5)) - 0.5;
  col += tooth * 0.05 * u_grain;

  fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
