#version 300 es
precision highp float;

/*
 * PaperGrain: the surface of a sheet of paper, with nothing on it.
 *
 * The image is a lighting calculation, not a pattern. One noise field becomes a
 * height, the height is differenced into a normal, and the normal meets one low
 * light. Draw that same field as tone instead and the result is a grey cloud
 * that could be anything; light it and it is a sheet of paper.
 *
 * The fibre is stretched along the machine direction, because the stock runs in
 * a direction on a paper machine and the fibres lie along it. Formation, the
 * cloud you see holding a sheet to a window, is a density rather than a shape,
 * so it goes into the tone. The tooth is smaller than a pixel, so it goes into
 * neither: it is a flicker added to the light, weighted by how much the light
 * rakes, because roughness you cannot resolve only shows as sparkle in grazing
 * light.
 */

uniform vec2  u_resolution;
uniform float u_dpr;
uniform float u_time;
uniform float u_period;

uniform vec3  u_paper;
uniform vec3  u_fibre;
uniform float u_scale;
uniform float u_direction;
uniform float u_stretch;
uniform float u_formation;
uniform float u_tooth;
uniform float u_light;
uniform float u_relief;
uniform float u_sweep;
uniform float u_shive;

out vec4 fragColor;

const float TAU = 6.28318530718;
const float PI = 3.14159265359;

float hash12(vec2 p) {
  return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453123);
}

/* Value noise, smoothstepped so the fields have no cell edges in them. */
float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash12(i), hash12(i + vec2(1.0, 0.0)), u.x),
    mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), u.x),
    u.y
  );
}

float fbm(vec2 p) {
  float sum = 0.0;
  float amp = 0.5;
  for (int i = 0; i < 4; i++) {
    sum += noise(p) * amp;
    p = p * 2.03 + 17.3;
    amp *= 0.5;
  }
  return sum;
}

/*
 * The fibre, in a frame rotated to the machine direction and squashed across
 * it, which is what makes the grain run one way. Isotropic noise here is the
 * single thing that stops a paper texture reading as paper: the sheets that
 * really are isotropic are the handmade ones, and they look like felt.
 */
float fibreAt(vec2 p) {
  float a = radians(u_direction);
  mat2 toGrain = mat2(cos(a), -sin(a), sin(a), cos(a));
  vec2 g = toGrain * p;
  g.x /= max(u_stretch, 0.05);
  return fbm(g * u_scale);
}

/*
 * Formation: the uneven spread of fibre, in patches far larger than the fibres.
 *
 * It belongs in the tone and not in the height, and that is the whole shape of
 * this shader rather than a detail. Formation is a density variation, so what
 * it changes is how much light comes back, not which way the surface faces.
 * Put it in the height with the fibre and two things go wrong: it contributes
 * almost nothing, because a broad field has almost no slope, and the fine fibre
 * that is left dominates the derivative and the sheet comes out as rough-cast
 * plaster.
 */
float formationAt(vec2 p) {
  return fbm(p * u_scale * 0.03 + 53.1);
}

void main() {
  vec2 cssRes = u_resolution / max(u_dpr, 0.001);
  vec2 cssPx = gl_FragCoord.xy / max(u_dpr, 0.001);
  float shortSide = max(min(cssRes.x, cssRes.y), 1.0);
  vec2 p = (cssPx - cssRes * 0.5) / shortSide;

  /*
   * Forward differences at one CSS pixel. The step has to be the pixel rather
   * than some small constant: a normal measured over a shorter distance than
   * the screen can resolve is sampling detail that is not in the image, and it
   * comes back as sparkle that moves when the canvas is resized.
   */
  float e = 1.0 / shortSide;
  float here = fibreAt(p);
  float hx = fibreAt(p + vec2(e, 0.0)) - here;
  float hy = fibreAt(p + vec2(0.0, e)) - here;

  // Divided by the step, so the slope is a slope rather than a difference, and
  // relief means the same thing at every canvas size.
  vec2 slope = vec2(hx, hy) / e;
  vec3 normal = normalize(vec3(-slope * u_relief * 0.02, 1.0));

  /*
   * One light, low. The swing is a sine of the phase, so it returns to where it
   * started and the loop closes exactly: a light that travels a full circle
   * passes through the back of the sheet on the way, which on a flat surface
   * reads as the image inverting.
   */
  float phase = TAU * u_time / max(u_period, 0.001);
  float azimuth = radians(135.0 + u_sweep * sin(phase));
  float elevation = mix(0.04, 1.0, clamp(u_light, 0.0, 1.0)) * PI * 0.5;
  vec3 sun = vec3(cos(azimuth) * cos(elevation), sin(azimuth) * cos(elevation), sin(elevation));

  /*
   * Paper is not a mirror and it is not a void. Nearly all of what comes off a
   * sheet is bounced light, so the ambient term is much the larger of the two
   * and the lit term is a small correction on top of it. Weight these the way a
   * solid object is weighted and the sheet turns to stone.
   */
  float lambert = max(dot(normal, sun), 0.0);
  float shade = 0.94 + 0.16 * (lambert - 0.5);

  /*
   * PaperGrain. Smaller than a pixel, so it cannot be in the surface: it is a
   * flicker in the light, weighted by how level the light is. Overhead light
   * fills the pits and the sheet goes flat, which is exactly what happens to a
   * sheet of paper under a ceiling light and the reason nobody photographs
   * paper that way.
   */
  float rake = 1.0 - clamp(u_light, 0.0, 1.0);
  float speck = hash12(floor(gl_FragCoord.xy)) - 0.5;
  shade += speck * 0.028 * u_tooth * (0.25 + 0.75 * rake);

  // The cloud, as tone. Centred on zero so it lightens and darkens the stock
  // rather than dragging the whole sheet one way.
  float cloud = (formationAt(p) - 0.5) * u_formation * 0.085;
  vec3 col = mix(u_paper, u_fibre, clamp(0.5 + cloud * 6.0, 0.0, 1.0)) * (shade + cloud);

  /*
   * Shive: specks of fibre the beater did not break down, which end up darker
   * than the sheet and are the one thing in here that is a mark rather than a
   * surface. Sparse on purpose. A sheet with visible shive all over it is a
   * sheet nobody bought.
   */
  vec2 cell = floor(cssPx * 0.5);
  float pick = hash12(cell + 91.7);
  float speckle = step(1.0 - u_shive * 0.0045, pick);
  col *= 1.0 - speckle * (0.10 + 0.14 * hash12(cell + 13.9));

  fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
