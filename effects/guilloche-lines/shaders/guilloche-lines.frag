#version 300 es
precision highp float;

/*
 * Guilloche: the engine-turned line work on a banknote, a share certificate or
 * the bezel of a watch.
 *
 * It is not noise and it is not a gradient. A real rose engine cuts one
 * continuous line whose radius is modulated by a set of gears, so the pattern
 * is a family of curves with a strict harmonic relationship. That is exactly
 * what this draws: several rosettes, each a circle whose radius wobbles at an
 * integer number of lobes, rendered as a line field rather than a fill.
 *
 * The integer lobe counts are the whole thing. Fractional ones never close, and
 * an open curve reads as a mistake rather than as engraving.
 */

uniform vec2  u_resolution;
uniform float u_dpr;
uniform float u_time;
uniform float u_period;
uniform vec3  u_paper;
uniform vec3  u_ink;
uniform vec3  u_accent;
uniform float u_scale;
uniform float u_pitch;
uniform float u_lobes;
uniform float u_waves;
uniform float u_depth;
uniform float u_weight;
uniform float u_accentBand;
uniform float u_grain;

out vec4 fragColor;

const float TAU = 6.28318530718;

float hash12(vec2 p) {
  return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453123);
}

/*
 * One engraved line family. `spacing` is how far apart the lines sit; the
 * derivative keeps them a constant width on screen however fast the field is
 * changing, which is what stops the centre turning into a solid disc.
 */
float engrave(float field, float weight) {
  float band = fract(field);
  float aa = fwidth(field);
  float edge = aa * (0.5 + weight * 2.0);
  return 1.0 - smoothstep(0.0, edge, min(band, 1.0 - band));
}

void main() {
  vec2 cssRes = u_resolution / max(u_dpr, 0.001);
  float shortSide = min(cssRes.x, cssRes.y);
  vec2 cssPx = gl_FragCoord.xy / max(u_dpr, 0.001);

  vec2 p = (cssPx - cssRes * 0.5) / (shortSide * 0.5);
  p /= max(u_scale, 0.05);

  float phase = TAU * u_time / max(u_period, 0.001);

  float r = length(p);
  float a = atan(p.y, p.x);

  /*
   * Three rosettes turning against each other, the way a rose engine stacks
   * gears. Their lobe counts are coprime, so the interference pattern takes a
   * long time to repeat and never looks like a simple grid.
   */
  float lobesA = floor(u_lobes);
  float lobesB = floor(u_lobes * 1.75) + 1.0;
  float lobesC = floor(u_lobes * 0.5) + 2.0;

  float waveA = sin(a * lobesA + phase) * u_depth;
  float waveB = sin(a * lobesB - phase * 1.5) * u_depth * 0.55;
  float waveC = cos(a * lobesC + phase * 0.5) * u_depth * 0.8;

  // Each family is the radius plus its own wobble, scaled into line spacing.
  float fieldA = (r + waveA) * u_pitch;
  float fieldB = (r + waveB) * u_pitch * 1.31;

  // The third runs around the circle rather than out from the centre, which is
  // what turns two ring families into woven guilloche instead of a moire.
  float fieldC = (a / TAU * u_waves + waveC + r * 0.35) * u_pitch * 0.42;

  float lineA = engrave(fieldA, u_weight);
  float lineB = engrave(fieldB, u_weight);
  /*
   * The angular family is singular at the origin: every spoke meets there, and
   * without this the middle of the rosette collapses into a solid blot. A real
   * rose engine has a centre finding of its own for the same reason.
   */
  float lineC = engrave(fieldC, u_weight) * smoothstep(0.0, 0.3, r);

  vec3 col = u_paper;
  // Multiplied, not added: this is ink on paper, and two lines crossing are
  // darker than one.
  col *= mix(vec3(1.0), u_ink, lineA * 0.85);
  col *= mix(vec3(1.0), u_ink, lineB * 0.7);
  col *= mix(vec3(1.0), u_ink, lineC * 0.5);

  /*
   * A single band of the pattern printed in the second colour, the way a
   * certificate prints one guilloche in red over the rest in black. It rides
   * the same field, so it is part of the engraving rather than a highlight laid
   * on top of it.
   */
  float ring = smoothstep(u_accentBand + 0.16, u_accentBand, abs(r - u_accentBand - 0.28));
  col = mix(col, col * mix(vec3(1.0), u_accent, lineA * 0.9), ring);

  float tooth = hash12(floor(cssPx * 0.5)) - 0.5;
  col += tooth * 0.05 * u_grain;

  fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
