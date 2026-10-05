#version 300 es
precision highp float;

/*
 * MarbledPaper: ink floated on size, dropped, then raked.
 *
 * This is not noise dressed up as marbling. Every operation a marbler performs
 * on a tray has a closed-form inverse, which is the fact the whole effect rests
 * on. A drop of ink pushes everything already floating outward by an exact
 * amount; a comb drawn through displaces points along its own direction by an
 * amount that depends only on how far they sit from it. Both are invertible in
 * one step, with no iteration and no search.
 *
 * So instead of simulating the tray forwards into a buffer, each pixel runs the
 * session backwards. Undo the combs, then undo the drops one at a time from the
 * last to the first, and the moment the point falls inside a drop you know which
 * ink it was. That is the colour. No render targets, no feedback, no history:
 * one pass, and the pattern is exact rather than approximated.
 *
 * It also explains the rings. A drop laid down later pushes an earlier one into
 * an annulus around itself, and walking the operations backwards reproduces that
 * for free rather than having to draw it.
 */

uniform vec2  u_resolution;
uniform float u_dpr;
uniform float u_time;
uniform float u_period;

uniform vec3  u_paper;
uniform vec3  u_ink;
uniform vec3  u_accent;
uniform float u_drops;
uniform float u_scale;
uniform float u_spread;
uniform float u_size;
uniform float u_rake;
uniform float u_comb;
uniform float u_swirl;
uniform float u_grain;

out vec4 fragColor;

const float TAU = 6.28318530718;

float hash11(float n) {
  return fract(sin(n * 127.1) * 43758.5453123);
}

vec2 hash21(float n) {
  return vec2(hash11(n), hash11(n + 71.3));
}

float hash12(vec2 p) {
  return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453123);
}

/*
 * Undo one pass of the comb.
 *
 * Forward, the comb displaces a point along `dir` by an amount that varies with
 * how far along the perpendicular it sits. The displacement therefore never
 * changes the quantity the displacement is computed from, so subtracting the
 * same vector is an exact inverse rather than an approximation of one. That is
 * the only reason the combs can be undone before the drops are.
 */
vec2 uncomb(vec2 p, vec2 dir, float amp, float freq, float phase) {
  vec2 n = vec2(-dir.y, dir.x);
  return p - dir * amp * sin(dot(p, n) * freq + phase);
}

/*
 * Undo one drop of radius r at c.
 *
 * A drop pushes everything already on the surface radially outward, conserving
 * area, so a point at distance m from the centre came from one at
 * sqrt(m * m - r * r). The max() guards the inside of the drop, where there is
 * nothing earlier to recover: the caller checks for that case first and takes
 * the ink colour instead.
 */
vec2 undrop(vec2 p, vec2 c, float r) {
  vec2 d = p - c;
  float m2 = dot(d, d);
  return c + d * sqrt(max(1.0 - (r * r) / m2, 0.0));
}

void main() {
  vec2 cssRes = u_resolution / max(u_dpr, 0.001);
  float shortSide = min(cssRes.x, cssRes.y);
  vec2 cssPx = gl_FragCoord.xy / max(u_dpr, 0.001);

  vec2 p = (cssPx - cssRes * 0.5) / (shortSide * 0.5);
  p /= max(u_scale, 0.05);

  float phase = TAU * u_time / max(u_period, 0.001);

  /*
   * Two combs at right angles, which is how a gel-git pattern is made: one pass
   * across, one pass down. Undone in the reverse of the order a marbler would
   * draw them, because this is the session running backwards.
   *
   * Their phases are whole multiples of the same angle, so the comb returns to
   * where it started after exactly one period and the loop closes.
   */
  p = uncomb(p, vec2(0.0, 1.0), u_swirl, u_comb * 0.73, phase);
  p = uncomb(p, vec2(1.0, 0.0), u_rake, u_comb, -phase);

  int count = int(clamp(u_drops, 1.0, 72.0));
  vec3 col = u_paper;
  bool found = false;

  /*
   * Backwards through the drops. The first one that contains the point is the
   * ink you can see, because anything dropped after it would have pushed this
   * point out of the way.
   */
  for (int i = 71; i >= 0; i--) {
    if (i >= count) continue;

    float fi = float(i);
    vec2 c = (hash21(fi * 3.73 + 1.0) - 0.5) * 2.0 * u_spread;
    float r = u_size * (0.62 + hash11(fi * 9.17) * 0.76);

    vec2 d = p - c;
    if (dot(d, d) <= r * r) {
      // Three inks off two colours: the accent, the ink, and the ink thinned
      // toward the paper, which is what a second pass of the same colour looks
      // like when the first has already spread.
      float pick = hash11(fi * 5.31 + 4.2);
      col = pick < 0.3 ? u_accent : (pick < 0.68 ? u_ink : mix(u_ink, u_paper, 0.4));
      found = true;
      break;
    }

    p = undrop(p, c, r);
  }

  // Anything that fell through every drop never had ink on it.
  if (!found) col = u_paper;

  float tooth = hash12(floor(cssPx * 0.5)) - 0.5;
  col += tooth * 0.05 * u_grain;

  fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
