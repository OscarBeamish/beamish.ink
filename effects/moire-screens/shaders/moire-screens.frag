#version 300 es
precision highp float;

/*
 * MoireScreens: two halftone screens at a small angle, beating.
 *
 * The fringes are not in this shader. Nothing here draws a fringe, or knows
 * where one is: there are two regular screens, and the interference is what
 * comes out. That is the whole point of building it this way rather than
 * drawing the pattern directly, and it is why the fringes behave correctly when
 * the angle changes. A small angle gives enormous fringes because that is what
 * the geometry says: the spacing of the beat goes as the pitch over twice the
 * sine of half the angle, so it runs away towards infinity as the screens line
 * up.
 *
 * The anti-aliasing is load-bearing. A regular screen at this frequency aliases
 * against the pixel grid, and that aliasing is itself a moire, so the fringes
 * would be partly the screens beating with the display rather than with each
 * other. Each screen's coverage is computed analytically and its edge softened
 * by exactly one pixel's footprint, measured with fwidth, which leaves the real
 * interference and nothing else.
 */

uniform vec2  u_resolution;
uniform float u_dpr;
uniform float u_time;
uniform float u_period;

uniform vec3  u_paper;
uniform vec3  u_first;
uniform vec3  u_second;
uniform float u_pitch;
uniform float u_coverage;
uniform float u_separation;
uniform float u_angle;
uniform float u_drift;
uniform float u_lines;
uniform float u_detune;

out vec4 fragColor;

const float TAU = 6.28318530718;

mat2 turn(float degrees) {
  float a = radians(degrees);
  return mat2(cos(a), -sin(a), sin(a), cos(a));
}

/*
 * One screen's ink coverage at this pixel.
 *
 * The distance to the nearest element is worked out in pixels, and the edge is
 * softened by the footprint of this pixel in that same measure, which is what
 * fwidth gives. Hard-edged instead, the screen aliases, and the aliasing is a
 * moire of its own against the display grid: the effect would be reporting on
 * the monitor rather than on the two screens.
 */
float screenAt(vec2 cssPx, float pitch, float degrees, float radius, float asLines) {
  vec2 q = (turn(-degrees) * cssPx) / max(pitch, 0.5);

  float d;
  if (asLines > 0.5) {
    // A line screen measures across the lines only, so the beat is in one axis.
    d = abs(fract(q.x) - 0.5) * max(pitch, 0.5);
  } else {
    vec2 cell = fract(q) - 0.5;
    d = length(cell) * max(pitch, 0.5);
  }

  float aa = max(fwidth(d), 0.0001);
  return clamp(smoothstep(radius + aa, radius - aa, d), 0.0, 1.0);
}

void main() {
  vec2 cssRes = u_resolution / max(u_dpr, 0.001);
  vec2 cssPx = gl_FragCoord.xy / max(u_dpr, 0.001);
  vec2 centred = cssPx - cssRes * 0.5;

  /*
   * The drift is a sine of the phase, so the second screen returns to where it
   * started and the loop closes. A screen turning continuously would pass
   * through the angles at which the beat vanishes and come out the other side,
   * which is a different and much busier effect.
   */
  float phase = TAU * u_time / max(u_period, 0.001);
  float second = u_angle + u_separation + u_drift * sin(phase);

  /*
   * Element radius from coverage. For dots the area of a disc in a square cell
   * is pi r squared over pitch squared, so the radius is the pitch times the
   * root of coverage over pi. For lines it is simply half the covered width.
   * Doing this properly is what makes coverage mean the same thing in both.
   */
  float pitchA = max(u_pitch, 0.5);
  float pitchB = pitchA * (1.0 + u_detune);
  float cover = clamp(u_coverage, 0.0, 1.0);
  float radiusA = u_lines > 0.5 ? pitchA * cover * 0.5 : pitchA * sqrt(cover / 3.14159265);
  float radiusB = u_lines > 0.5 ? pitchB * cover * 0.5 : pitchB * sqrt(cover / 3.14159265);

  float a = screenAt(centred, pitchA, u_angle, radiusA, u_lines);
  float b = screenAt(centred, pitchB, second, radiusB, u_lines);

  /*
   * Ink multiplies. Two transparent layers pass the product of what each
   * passes, so the sheet under both is the product of the two transmittances.
   * Added instead, the overlaps saturate and the fringes flatten at the dark
   * end, which is the difference between this reading as print and reading as
   * two translucent screens on a lightbox.
   */
  vec3 col = u_paper;
  col *= mix(vec3(1.0), u_first / max(u_paper, vec3(0.001)), a);
  col *= mix(vec3(1.0), u_second / max(u_paper, vec3(0.001)), b);

  fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
