#version 300 es
precision highp float;

/*
 * RegistrationMarks: the marks outside the trim, with the plates out of
 * register.
 *
 * Everything is a signed distance in CSS pixels, turned into coverage with a
 * softening of exactly one pixel's footprint. That is not for looks. These are
 * hairlines moving by fractions of a pixel, and a hairline without
 * anti-aliasing crawls between whole pixels as it drifts: the sub-pixel
 * movement is the entire subject here, so it has to be the thing that survives.
 *
 * The inks multiply. Where the three plates land together the mark goes nearly
 * black; where they have come apart you see three coloured marks beside each
 * other. That difference is precisely how misregistration announces itself on a
 * real sheet, and adding the inks instead loses it.
 */

uniform vec2  u_resolution;
uniform float u_dpr;
uniform float u_time;
uniform float u_period;

uniform vec3  u_paper;
uniform vec3  u_first;
uniform vec3  u_second;
uniform vec3  u_third;
uniform float u_size;
uniform float u_weight;
uniform float u_arms;
uniform float u_margin;
uniform float u_spread;
uniform float u_bar;

out vec4 fragColor;

const float TAU = 6.28318530718;

/* A rule of a given half-length and half-width, as a signed distance. */
float rule(vec2 p, vec2 extent) {
  // Not half, and the swatch below is not patch. Both are reserved words in
  // GLSL, held for types the language does not have, and both fail at compile
  // rather than at run time.
  vec2 d = abs(p) - extent;
  return min(max(d.x, d.y), 0.0) + length(max(d, 0.0));
}

/*
 * One registration mark: a ring with a cross through it, the arms running past
 * the ring on all four sides. The ring reads rotation and the arms read
 * translation, which is why the real thing has both.
 */
float markAt(vec2 p, float radius, float weight) {
  float ring = abs(length(p) - radius) - weight * 0.5;
  float reach = radius * max(u_arms, 1.0);
  float across = rule(p, vec2(reach, weight * 0.5));
  float down = rule(p, vec2(weight * 0.5, reach));
  return min(ring, min(across, down));
}

/* One plate's ink coverage at this pixel, marks and bar together. */
float plateAt(vec2 cssPx, vec2 cssRes, vec2 offset, float slot, float slots) {
  vec2 p = cssPx - offset;
  float shortSide = max(min(cssRes.x, cssRes.y), 1.0);
  vec2 inset = cssRes * 0.5 - vec2(u_margin * shortSide);

  // Four marks, one at each corner of the inset rectangle.
  vec2 centred = p - cssRes * 0.5;
  vec2 folded = abs(centred) - inset;
  float d = markAt(folded, max(u_size, 1.0), max(u_weight, 0.3));

  /*
   * The colour bar along the foot: one solid patch per plate, side by side, the
   * way a press sheet carries them for a densitometer. They are the other half
   * of what a printer reads off the sheet.
   */
  if (u_bar > 0.5) {
    float barWidth = min(cssRes.x * 0.1, 58.0);
    float gap = barWidth * 0.18;
    float total = slots * barWidth + (slots - 1.0) * gap;
    float left = cssRes.x * 0.5 - total * 0.5 + slot * (barWidth + gap);
    vec2 swatch = p - vec2(left + barWidth * 0.5, cssRes.y - u_margin * shortSide * 0.45);
    d = min(d, rule(swatch, vec2(barWidth * 0.5, u_bar * 0.5)));
  }

  float aa = max(fwidth(d), 0.0001);
  return clamp(smoothstep(aa, -aa, d), 0.0, 1.0);
}

void main() {
  vec2 cssRes = u_resolution / max(u_dpr, 0.001);
  vec2 cssPx = gl_FragCoord.xy / max(u_dpr, 0.001);
  // y down, so the foot of the sheet is the foot of the frame.
  cssPx.y = cssRes.y - cssPx.y;

  /*
   * Each plate drifts on a closed orbit, a third of a turn apart, so after one
   * period every plate is back where it started and the loop closes. Circles
   * rather than a wander: a press drifts because something is turning.
   */
  float phase = TAU * u_time / max(u_period, 0.001);
  vec2 a = vec2(cos(phase), sin(phase * 2.0)) * u_spread * 0.5;
  vec2 b = vec2(cos(phase + 2.094), sin(phase * 2.0 + 1.047)) * u_spread;
  vec2 c = vec2(cos(phase + 4.189), sin(phase * 2.0 + 3.142)) * u_spread * 0.7;

  float ia = plateAt(cssPx, cssRes, a, 0.0, 3.0);
  float ib = plateAt(cssPx, cssRes, b, 1.0, 3.0);
  float ic = plateAt(cssPx, cssRes, c, 2.0, 3.0);

  vec3 col = u_paper;
  col *= mix(vec3(1.0), u_first / max(u_paper, vec3(0.001)), ia);
  col *= mix(vec3(1.0), u_second / max(u_paper, vec3(0.001)), ib);
  col *= mix(vec3(1.0), u_third / max(u_paper, vec3(0.001)), ic);

  fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
