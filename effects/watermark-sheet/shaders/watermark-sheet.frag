#version 300 es
precision highp float;

/*
 * WatermarkSheet: a sheet of handmade paper held up to the light.
 *
 * Everything here is thickness. Paper is translucent, so what you see against a
 * light is not ink but where the sheet is thinner and lets more through. Three
 * things make it thinner, and all three are on the mould the sheet was formed
 * on rather than in the pulp.
 *
 * The laid lines are the close-set wires of the mould, so the sheet is slightly
 * thinner over each one. The chain lines are the heavier wires at right angles
 * holding those together, spaced an inch or so apart. And the formation is the
 * cloudiness: fibres never settle evenly, and the blotchy variation that gives
 * is the difference between handmade paper and a machine sheet.
 *
 * The watermark proper is a wire device sewn onto the mould. The sheet is much
 * thinner there, which is why a watermark is brighter than everything around it
 * and why it only shows against a light.
 *
 * Nothing in here darkens. Every term lightens the paper, because every term is
 * somewhere the sheet is thinner.
 */

uniform vec2  u_resolution;
uniform float u_dpr;
uniform float u_time;
uniform float u_period;

uniform vec3  u_paper;
uniform vec3  u_light;
uniform float u_laid;
uniform float u_laidPitch;
uniform float u_chain;
uniform float u_chainPitch;
uniform float u_formation;
uniform float u_cloud;
uniform float u_device;
uniform float u_deviceSize;
uniform float u_angle;
uniform float u_grain;

out vec4 fragColor;

const float TAU = 6.28318530718;
const float DEG = 0.01745329252;

float hash12(vec2 p) {
  return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453123);
}

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
    p *= 2.07;
    amp *= 0.5;
  }
  return sum;
}

vec2 rot(vec2 p, float a) {
  float c = cos(a);
  float s = sin(a);
  return mat2(c, -s, s, c) * p;
}

/*
 * A ring with a bar across it: a countermark, the plain device a mill used when
 * it was not using its own emblem. Drawn as a signed distance so the wire has an
 * even thickness all the way round, which a wire does.
 */
float countermark(vec2 p, float size) {
  float ring = abs(length(p) - size) - size * 0.085;
  vec2 b = abs(p) - vec2(size * 1.25, size * 0.075);
  float bar = length(max(b, 0.0)) + min(max(b.x, b.y), 0.0);
  return min(ring, bar);
}

void main() {
  vec2 cssRes = u_resolution / max(u_dpr, 0.001);
  float shortSide = min(cssRes.x, cssRes.y);
  vec2 cssPx = gl_FragCoord.xy / max(u_dpr, 0.001);
  vec2 p = (cssPx - cssRes * 0.5) / (shortSide * 0.5);

  // The mould sits at its own angle to the frame, so the wires are not
  // obediently square to the screen.
  vec2 mould = rot(p, u_angle * DEG);

  /*
   * The sheet is tilted slowly against the light rather than anything moving on
   * it. A closed orbit, so after one period it is back where it began.
   */
  float phase = TAU * u_time / max(u_period, 0.001);
  vec2 orbit = vec2(cos(phase), sin(phase)) * 0.22;

  // Laid lines: close-set wires, so a fine ripple rather than hard lines. The
  // sheet is thinner over each wire, so each one lets a little more light.
  float laid = (sin(mould.y * u_laidPitch) * 0.5 + 0.5) * u_laid;

  /*
   * Chain lines: the heavy wires at right angles, an inch or so apart. A narrow
   * band rather than a ripple, because the sheet is drawn down sharply over a
   * thick wire rather than following it.
   */
  float chainPhase = fract(mould.x * u_chainPitch);
  float chainBand = 1.0 - smoothstep(0.0, 0.06, min(chainPhase, 1.0 - chainPhase));
  float chain = chainBand * u_chain;

  // Formation: fibres never settle evenly, and this cloudiness is most of what
  // separates a handmade sheet from a machine one.
  float formation = (fbm(p * u_cloud + orbit) - 0.5) * u_formation;

  // The device, which is much thinner than anything else and therefore the
  // brightest thing on the sheet.
  float wire = countermark(rot(p, u_angle * DEG), max(u_deviceSize, 0.01));
  float aa = fwidth(wire) + 0.001;
  float device = (1.0 - smoothstep(0.0, aa * 2.0, wire)) * u_device;

  // Everything lightens. Every term is somewhere the sheet is thinner, and a
  // thin sheet passes more light; nothing here is ink.
  float through = clamp(laid + chain + formation + device, 0.0, 1.0);
  vec3 col = mix(u_paper, u_light, through);

  float tooth = hash12(floor(cssPx * 0.5) + 23.0) - 0.5;
  col += tooth * 0.045 * u_grain;

  fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
