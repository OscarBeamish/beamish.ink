#version 300 es
precision highp float;

/*
 * StippleField: tone carried by how many dots there are, not how big they are.
 *
 * That is the whole distinction from a halftone, and it is worth being exact
 * about because the two look superficially alike. A halftone puts a dot in the
 * middle of every cell of a regular grid and varies its size: the count is
 * fixed and the area does the work. A stipple engraver has one nib, so every
 * mark is the same size, and darker means more marks closer together.
 *
 * So the grid here is only a way of not having to sort anything. Each cell
 * holds at most one dot, thrown off centre by a hash, and whether that dot
 * exists at all is decided by comparing a second hash against the tone wanted
 * at that point. Off-grid positions and a population that thins out is what
 * reads as a hand rather than as a screen.
 *
 * The tone field drifts on a closed orbit through noise space, so the loop
 * returns to exactly where it started.
 */

uniform vec2  u_resolution;
uniform float u_dpr;
uniform float u_time;
uniform float u_period;

uniform vec3  u_paper;
uniform vec3  u_ink;
uniform vec3  u_accent;
uniform float u_pitch;
uniform float u_jitter;
uniform float u_scale;
uniform float u_weight;
uniform float u_contrast;
uniform float u_accentShare;
uniform float u_grain;

out vec4 fragColor;

const float TAU = 6.28318530718;

float hash12(vec2 p) {
  return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453123);
}

vec2 hash22(vec2 p) {
  return vec2(hash12(p), hash12(p + 37.19));
}

/* Value noise. Smoothstepped so the tone field has no visible cell edges. */
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
    p *= 2.03;
    amp *= 0.5;
  }
  return sum;
}

void main() {
  vec2 cssRes = u_resolution / max(u_dpr, 0.001);
  float shortSide = min(cssRes.x, cssRes.y);
  vec2 cssPx = gl_FragCoord.xy / max(u_dpr, 0.001);
  vec2 p = (cssPx - cssRes * 0.5) / (shortSide * 0.5);

  /*
   * A closed orbit through noise space. The field is sampled at a point that
   * travels a circle, so after one period it is back where it began and the
   * loop is seamless rather than crossfaded.
   */
  float phase = TAU * u_time / max(u_period, 0.001);
  vec2 orbit = vec2(cos(phase), sin(phase)) * 0.35;

  float tone = fbm(p * u_scale + orbit);
  // Centred on 0.5 before the contrast is applied, so raising contrast opens
  // the field out from the midtone rather than dragging the whole thing dark.
  tone = clamp((tone - 0.5) * u_contrast + 0.5, 0.0, 1.0);

  /*
   * The cell grid lives in CSS pixels rather than in the normalised space, so
   * the dots stay the same size on screen whatever shape the element is and
   * however the field is scaled.
   */
  vec2 cell = cssPx / max(u_pitch, 1.0);
  vec2 id = floor(cell);
  vec2 f = fract(cell);

  /*
   * Neighbours as well as this cell. A dot thrown off centre crosses into the
   * next cell, and testing only its own would clip it at the boundary: the
   * jitter would read as dots being sliced rather than as dots being scattered.
   */
  float aa = max(fwidth(cell.x), fwidth(cell.y)) * 0.8 + 0.001;
  float cover = 0.0;
  float accent = 0.0;

  for (int oy = -1; oy <= 1; oy++) {
    for (int ox = -1; ox <= 1; ox++) {
      vec2 nid = id + vec2(float(ox), float(oy));

      /*
       * Whether that cell carries a mark at all. One nib, so the decision is
       * present or absent rather than large or small, and a fixed hash per cell
       * compared against the tone is what makes the population thin out
       * smoothly as the field lightens.
       */
      if (hash12(nid + 11.3) > tone) continue;

      // The neighbour's dot, in this pixel's own cell coordinates.
      vec2 jitter = (hash22(nid) - 0.5) * u_jitter;
      vec2 centre = vec2(float(ox), float(oy)) + 0.5 + jitter;

      float mark = smoothstep(u_weight + aa, u_weight - aa, length(f - centre));
      cover = max(cover, mark);
      if (hash12(nid + 71.7) < u_accentShare) accent = max(accent, mark);
    }
  }

  vec3 ink = mix(u_ink, u_accent, accent);
  vec3 col = mix(u_paper, ink, cover);

  float tooth = hash12(floor(cssPx * 0.5) + 5.0) - 0.5;
  col += tooth * 0.05 * u_grain;

  fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
