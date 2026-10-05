#version 300 es
precision highp float;

/*
 * PointerFilings: iron filings over a magnet, and the magnet is the cursor.
 *
 * Filings do not point at a magnet, which is the thing most versions of this get
 * wrong. They align with the field, and the field of a dipole loops: out of one
 * pole, round, and back into the other. Spokes radiating from a point are what
 * you get from a single charge, and a single magnetic charge is not a thing that
 * exists.
 *
 * So this evaluates the real dipole expression. For a moment m at distance r the
 * field runs along 3(m . rhat)rhat - m, and every mark is a short segment laid
 * along it. The loops come out of the maths rather than being drawn.
 *
 * One mark per cell, thrown off centre, so the grid the marks are organised by
 * never shows. Each pixel is tested against the nine cells around it, because a
 * segment is long enough to cross well into its neighbours.
 */

uniform vec2  u_resolution;
uniform float u_dpr;
uniform vec2  u_pointer;
uniform float u_active;

uniform vec3  u_paper;
uniform vec3  u_ink;
uniform vec3  u_accent;
uniform float u_pitch;
uniform float u_length;
uniform float u_weight;
uniform float u_reach;
uniform float u_jitter;
uniform float u_tilt;
uniform float u_grain;

out vec4 fragColor;

const float DEG = 0.01745329252;

float hash12(vec2 p) {
  return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453123);
}

vec2 hash22(vec2 p) {
  return vec2(hash12(p), hash12(p + 37.19));
}

/*
 * Distance to a line segment of halfLen-length `halfLen` centred on the origin and
 * lying along `dir`. Clamping the projection is what makes it a segment rather
 * than an infinite line, and it is the whole of the shape.
 */
float segment(vec2 p, vec2 dir, float halfLen, float radius) {
  float t = clamp(dot(p, dir), -halfLen, halfLen);
  return length(p - dir * t) - radius;
}

/*
 * The field of a dipole with moment m at offset r. This is the expression a
 * physics text gives, minus the constants, which only scale something that is
 * normalised two lines later anyway.
 */
vec2 dipole(vec2 r, vec2 m) {
  float d = max(length(r), 1e-4);
  vec2 rhat = r / d;
  return (3.0 * dot(m, rhat) * rhat - m) / (d * d * d);
}

void main() {
  vec2 cssRes = u_resolution / max(u_dpr, 0.001);
  vec2 cssPx = gl_FragCoord.xy / max(u_dpr, 0.001);
  float shortSide = min(cssRes.x, cssRes.y);

  // The pointer arrives 0 to 1 across the element with y down the page, and
  // gl_FragCoord counts up from the bottom.
  vec2 magnet = vec2(u_pointer.x, 1.0 - u_pointer.y) * cssRes;

  // The bar the moment lies along. Tilting it turns the whole pattern, which is
  // what you would do by turning the magnet on the bench.
  vec2 m = vec2(cos(u_tilt * DEG), sin(u_tilt * DEG));

  vec2 cell = cssPx / max(u_pitch, 2.0);
  vec2 id = floor(cell);
  vec2 f = fract(cell);

  float aa = max(fwidth(cell.x), fwidth(cell.y)) * 0.9 + 0.001;
  float cover = 0.0;
  float heat = 0.0;

  for (int oy = -1; oy <= 1; oy++) {
    for (int ox = -1; ox <= 1; ox++) {
      vec2 nid = id + vec2(float(ox), float(oy));
      vec2 jitter = (hash22(nid) - 0.5) * u_jitter;
      vec2 centre = vec2(float(ox), float(oy)) + 0.5 + jitter;

      // Where this mark sits on screen, so the field is sampled at the mark
      // rather than at the pixel. Sampling per pixel bends each segment into a
      // curve, which no single filing does.
      vec2 markPx = (id + centre) * max(u_pitch, 2.0);
      vec2 r = (markPx - magnet) / shortSide;

      vec2 b = dipole(r, m);
      float strength = length(b);
      vec2 dir = strength > 1e-6 ? b / strength : vec2(1.0, 0.0);

      /*
       * Near the magnet the dipole expression runs away to infinity, so the
       * falloff is a ratio rather than a product: it saturates at 1 instead of
       * producing a handful of enormous marks at the centre.
       */
      float pull = strength / (strength + 1.0 / max(u_reach, 0.001));

      // Unaligned filings lie flat and short; a strong field stands them up in
      // a line. Length carrying the strength is what makes the pattern legible
      // without the marks changing weight.
      float halfLen = u_length * mix(0.18, 1.0, pull);
      float sd = segment(f - centre, dir, halfLen, u_weight);
      float mark = smoothstep(aa, -aa, sd);

      cover = max(cover, mark);
      heat = max(heat, mark * pull);
    }
  }

  // Idle: with no pointer the field is centred and the pattern is static, which
  // is a filing tray nobody has touched rather than a broken effect.
  cover *= mix(0.55, 1.0, u_active);

  vec3 ink = mix(u_ink, u_accent, smoothstep(0.1, 0.55, heat));
  vec3 col = mix(u_paper, ink, cover);

  float tooth = hash12(floor(cssPx * 0.5) + 3.0) - 0.5;
  col += tooth * 0.05 * u_grain;

  fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
