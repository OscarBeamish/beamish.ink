#version 300 es
precision highp float;

/*
 * Overprint — two ink plates drifting out of registration behind a halftone
 * screen, composited the way ink actually behaves on paper: multiplied, not
 * added. Additive light on a dark canvas is the easy version of this and it is
 * the one everybody else ships.
 *
 * Everything animates on a circle in noise space, so the loop is exactly
 * periodic over u_period and the recorded video is seamless with no crossfade.
 */

uniform vec2  u_resolution;  // drawing buffer, device px
uniform float u_dpr;
uniform float u_time;        // seconds
uniform float u_period;      // loop length, seconds
uniform vec3  u_paper;
uniform vec3  u_inkA;
uniform vec3  u_inkB;
uniform float u_scale;
uniform float u_screen;      // halftone dots per 100 CSS px
uniform float u_angleA;      // screen angle, degrees
uniform float u_angleB;
uniform float u_drift;       // registration error, CSS px
uniform float u_coverage;    // 0..1 ink density
uniform float u_grain;       // 0..1 paper tooth

out vec4 fragColor;

const float TAU = 6.28318530718;

vec2 hash22(vec2 p) {
  p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
  return fract(sin(p) * 43758.5453123) * 2.0 - 1.0;
}

float hash12(vec2 p) {
  return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453123);
}

float gnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = dot(hash22(i + vec2(0.0, 0.0)), f - vec2(0.0, 0.0));
  float b = dot(hash22(i + vec2(1.0, 0.0)), f - vec2(1.0, 0.0));
  float c = dot(hash22(i + vec2(0.0, 1.0)), f - vec2(0.0, 1.0));
  float d = dot(hash22(i + vec2(1.0, 1.0)), f - vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 4; i++) {
    v += a * gnoise(p);
    p *= 2.03;
    a *= 0.5;
  }
  return v;
}

mat2 rot(float degrees) {
  float a = radians(degrees);
  float c = cos(a);
  float s = sin(a);
  return mat2(c, -s, s, c);
}

/*
 * Area-proportional halftone dot. Radius goes as sqrt(value) so apparent tone is
 * linear in `value`, which is what a real screen does. Anti-aliased against the
 * screen-space derivative, so it stays clean at any DPR instead of buzzing.
 */
float halftone(vec2 cssPx, float angle, float value, float freq) {
  vec2 g = rot(angle) * cssPx * freq;
  vec2 cell = fract(g) - 0.5;
  float d = length(cell) * 2.0;
  // 1.45, not 1.0: the cell corners are sqrt(2) from the centre, so a dot that
  // stops at 1.0 can never close up and the darkest tone tops out around 78%.
  float r = sqrt(clamp(value, 0.0, 1.0)) * 1.45;
  float aa = fwidth(d) * 1.2 + 1e-4;
  return 1.0 - smoothstep(r - aa, r + aa, d);
}

/*
 * fbm lands in roughly -0.5..0.5 and clusters hard around the middle. Left alone
 * that maps to one flat mid-tone across the whole canvas — a rug, not a print.
 * Amplify first, then window: the amplification buys real highlights where the
 * paper shows through, and real solids.
 */
float tone(float raw, float coverage) {
  float v = clamp(raw * 1.7 + 0.5, 0.0, 1.0);
  float edge = 1.0 - coverage;
  float t = smoothstep(edge - 0.30, edge + 0.30, v);
  // Clean the toe. Without this the highlights keep a haze of sub-pixel dots
  // that reads as dirt on the paper rather than as a light tone — and, being
  // fine unpredictable detail, costs more in the encoded video than the entire
  // rest of the frame.
  return t * smoothstep(0.03, 0.11, t);
}

void main() {
  vec2 cssPx = gl_FragCoord.xy / max(u_dpr, 0.001);
  float shortSide = min(u_resolution.x, u_resolution.y) / max(u_dpr, 0.001);
  vec2 uv = cssPx / max(shortSide, 1.0);

  float phase = TAU * u_time / max(u_period, 0.001);

  // A closed orbit through noise space. Any path that returns to its start works;
  // a circle is the one with no easing artefact at the seam.
  // Amplitudes are small on purpose. The loop is short so that a five-second
  // recording is a whole cycle; the calm comes from how far the field travels,
  // not from how long it takes.
  vec2 orbitA = vec2(cos(phase), sin(phase)) * 0.30;
  vec2 orbitB = vec2(cos(phase + 2.1), sin(phase + 2.1)) * 0.24 + vec2(11.3, -6.7);

  float rawA = fbm(uv * u_scale + orbitA);
  float rawB = fbm(uv * u_scale * 1.18 + orbitB);

  // Plate B carries a little less ink than plate A, which is what stops the two
  // reading as one muddy colour where they overlap.
  float valueA = tone(rawA, u_coverage);
  float valueB = tone(rawB, u_coverage * 0.88);

  float freq = u_screen / 100.0;

  // The registration error: plate B's screen slides against plate A's. Both
  // components are periodic in `phase`, so the seam is exact.
  vec2 misfit = vec2(cos(phase + 1.7), sin(phase * 2.0 + 0.4)) * u_drift;

  float dotA = halftone(cssPx, u_angleA, valueA, freq);
  float dotB = halftone(cssPx + misfit, u_angleB, valueB, freq);

  // Multiply, because that is what a second pass of ink does to the first.
  vec3 col = u_paper;
  col *= mix(vec3(1.0), u_inkA, dotA);
  col *= mix(vec3(1.0), u_inkB, dotB);

  // Static tooth, not animated film grain. Animated grain flickers, and a
  // flicker this fine is exactly what WCAG 2.3.1 is about.
  //
  // Two-pixel blocks rather than one. At 2x DPR a one-pixel grain is below what
  // the eye resolves anyway, and it is the single most expensive thing in the
  // frame for a video codec — pure noise, no structure to predict.
  float tooth = hash12(floor(cssPx * 0.5)) - 0.5;
  col += tooth * 0.055 * u_grain;

  fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
