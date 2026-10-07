#version 300 es
precision highp float;

/*
 * LightShafts: light through an occluder, falling across the frame in bands.
 *
 * The whole image comes from one quantity: the angle from the source to the
 * pixel. The occluder is a repeating profile of bars and gaps read against that
 * angle, which is why the beams fan out from the source rather than running
 * parallel down the frame. Push the source far enough away and the fan becomes
 * parallel on its own, because that is what distance does to a fan.
 *
 * Two details carry it, and both are cheap.
 *
 * The shadow edges soften with distance travelled. A shadow is sharp only near
 * the thing that cast it: the source has width, so the half-shadow grows as the
 * shadow runs. Leave this out and the beams are triangles with hard sides, which
 * is what every version of this effect looks like.
 *
 * The motes are drawn only inside the beams. Light in clean air is invisible
 * from the side, so the dust is not decoration laid over the shafts, it is the
 * reason there is anything to see.
 */

uniform vec2  u_resolution;
uniform float u_dpr;
uniform float u_time;
uniform float u_period;

uniform vec3  u_ground;
uniform vec3  u_light;
uniform float u_angle;
uniform float u_distance;
uniform float u_bars;
uniform float u_gap;
uniform float u_softness;
uniform float u_spread;
uniform float u_reach;
uniform float u_strength;
uniform float u_dust;
uniform float u_drift;

out vec4 fragColor;

const float TAU = 6.28318530718;

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

void main() {
  vec2 cssRes = u_resolution / max(u_dpr, 0.001);
  vec2 cssPx = gl_FragCoord.xy / max(u_dpr, 0.001);
  float shortSide = max(min(cssRes.x, cssRes.y), 1.0);
  vec2 p = (cssPx - cssRes * 0.5) / shortSide;

  /*
   * The source, off frame. The swing is a sine of the phase so it returns to
   * where it started: a source that travels a full circle crosses the frame on
   * the way round, and a light passing through the room it is lighting is a
   * different effect entirely.
   */
  float phase = TAU * u_time / max(u_period, 0.001);
  float a = radians(u_angle + u_drift * sin(phase));
  vec2 source = vec2(cos(a), sin(a)) * max(u_distance, 0.02);

  vec2 toPixel = p - source;
  float travelled = length(toPixel);
  float bearing = atan(toPixel.y, toPixel.x);

  /*
   * The occluder, read against the bearing. Scaled by the distance of the
   * source so the bars keep the same apparent width on the frame as the source
   * is moved out: without this, pushing the light away to straighten the beams
   * also squeezes them all into a sliver.
   */
  float across = bearing * max(u_distance, 0.02) * u_bars;
  float within = abs(fract(across) - 0.5) * 2.0;

  /*
   * The penumbra. The edge of a shadow is sharp only near the thing that cast
   * it, because the source has width and the half-shadow it throws grows with
   * the distance the shadow has run. One multiplication, and it is the whole
   * difference between a beam and a triangle.
   */
  float blur = u_softness * (1.0 + u_spread * travelled);
  float edge = 1.0 - clamp(u_gap, 0.01, 0.99);
  float open = smoothstep(edge + blur, max(edge - blur, 0.0), within);

  // How far the light gets. Beyond its reach the room is just the room.
  float falloff = exp(-travelled / max(u_reach, 0.01));

  float beam = open * falloff * u_strength;

  /*
   * Motes, and only inside the beam. They drift across it rather than along it,
   * because dust in a room is moved by the air and not by the light, and the
   * drift is a whole number of turns over the period so the loop closes.
   *
   * The drift is very small on purpose. Dust hangs: it does not stream. The
   * first pass moved the mote field fifteen of its own widths over a period,
   * which measured three times the change per frame of everything else here put
   * together, for something that read as the air being blown out of the room.
   */
  vec2 air = p * 26.0 + vec2(sin(phase) * 0.14, cos(phase) * 0.09);
  float motes = noise(air) * noise(air * 2.7 + 11.0);
  motes = smoothstep(0.34, 0.72, motes);
  beam *= 1.0 + motes * u_dust * 1.1;

  // Plus the light that has bounced around the room and arrives from nowhere in
  // particular. Without it the unlit bands are flat and the frame reads as two
  // colours rather than as one room.
  float ambient = falloff * 0.22 * u_strength;

  vec3 col = u_ground + u_light * (beam + ambient);

  float tooth = hash12(floor(gl_FragCoord.xy)) - 0.5;
  col += tooth * 0.012;

  fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
