#version 300 es
precision highp float;

/*
 * AuroraCurtain: the northern lights, built the way they are made.
 *
 * It is not a rainbow gradient with some noise on it, and the difference is
 * most of why those read as wallpaper. An aurora is emission: electrons follow
 * the magnetic field down into the atmosphere and excite gas along the way, so
 * everything about its shape follows from that.
 *
 *   It hangs in vertical rays, because the field lines are near vertical at
 *   those latitudes and the light is emitted along them. That is the striation,
 *   and it is the single most recognisable thing about an aurora.
 *
 *   The bottom edge is sharp and the top is not. The electrons stop at the
 *   altitude where the air finally gets thick enough, which is an abrupt floor
 *   at around 100km, and thin out upwards over hundreds of kilometres.
 *
 *   The colour is altitude. Atomic oxygen gives the green line at 557.7nm low
 *   down, and the red line at 630nm higher up where collisions are rare enough
 *   to let the slower transition happen. So green at the foot running to red at
 *   the top, never the other way round and never a hue cycle.
 *
 *   The curtain folds along its length rather than waving as a whole. What you
 *   are looking at is a sheet seen edge on, so a fold reads as a bright rib.
 *
 * Everything moves on sums of sines whose time coefficients are whole numbers
 * of turns over the period, so the loop closes exactly. A noise field advanced
 * by time would never return to its first frame, and the recorder needs it to.
 */

uniform vec2  u_resolution;
uniform float u_dpr;
uniform float u_time;
uniform float u_period;

uniform vec3  u_sky;
uniform vec3  u_low;
uniform vec3  u_high;

uniform float u_curtains;
uniform float u_height;
uniform float u_fold;
uniform float u_rays;
uniform float u_pitch;
uniform float u_brightness;
uniform float u_stars;
uniform float u_horizon;
uniform float u_grain;

out vec4 fragColor;

const float TAU = 6.28318530718;

float hash12(vec2 p) {
  return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453123);
}

/*
 * The fold of one curtain along its length.
 *
 * Three sines, and the time coefficients are 1, 2 and 3 turns over the period.
 * Whole numbers are not a detail: a fractional one never comes back to where it
 * started, and the video jumps once a cycle.
 */
float fold(float x, float phase, float seed) {
  float s = sin(x * 2.1 + phase + seed) * 0.55;
  s += sin(x * 4.3 - phase * 2.0 + seed * 2.1) * 0.3;
  s += sin(x * 8.7 + phase * 3.0 + seed * 3.7) * 0.15;
  return s;
}

/*
 * A note on those spatial frequencies, because the first version of this had
 * them ten times too low and the mistake is invisible in the maths.
 *
 * x spans the aspect ratio, so about 1.8 on a wide frame. A term at sin(x * 0.7)
 * turns through 1.25 radians across the whole canvas, which is a fifth of a
 * cycle: not a fold, a tilt. Every curtain came out as one smooth arc and the
 * stack of them read as a hillside. A frequency here is only meaningful against
 * the width it has to cross.
 */

/*
 * The vertical rays, as a modulation along the curtain rather than across it.
 *
 * Three more sines at a much higher spatial frequency. They drift faster than
 * the fold does, which is what makes the curtain look like it is being fed
 * light from somewhere rather than simply swaying.
 */
float striation(float x, float phase, float seed) {
  float s = sin(x * u_pitch + phase * 2.0 + seed) * 0.5;
  s += sin(x * u_pitch * 2.3 - phase * 3.0 + seed * 1.7) * 0.3;
  s += sin(x * u_pitch * 4.7 + phase * 5.0 + seed * 2.9) * 0.2;
  return s;
}

void main() {
  vec2 cssRes = u_resolution / max(u_dpr, 0.001);
  vec2 cssPx = gl_FragCoord.xy / max(u_dpr, 0.001);

  // y runs 0 at the horizon to 1 at the top of the frame, which is the way an
  // aurora is measured and saves flipping it in every term below.
  vec2 uv = cssPx / cssRes;
  float aspect = cssRes.x / max(cssRes.y, 1.0);
  float x = (uv.x - 0.5) * aspect;

  float phase = TAU * u_time / max(u_period, 0.001);

  vec3 col = u_sky;

  /*
   * Stars first, so the aurora washes over them rather than sitting under them.
   *
   * One candidate per cell of a fixed grid, which needs no sorting and cannot
   * drift. They do not twinkle: a twinkle is atmospheric scintillation, it is
   * strongest near the horizon and nearly absent overhead, and faking it evenly
   * across the frame costs a per-frame change in every pixel for something
   * nobody looks at.
   */
  vec2 grid = uv * vec2(aspect, 1.0) * 150.0;
  vec2 cell = floor(grid);
  float pick = hash12(cell);
  vec2 at = vec2(hash12(cell + 11.3), hash12(cell + 27.7));
  float d = length(fract(grid) - at);
  float star = step(0.985, pick) * exp(-d * d * 90.0);
  // Brighter overhead, because low stars are seen through more air.
  col += vec3(0.85, 0.89, 1.0) * star * u_stars * smoothstep(0.0, 0.5, uv.y);

  /*
   * A little light on the horizon. Nowhere on Earth is the bottom of the sky
   * as dark as the top: there is always a town somewhere behind you.
   */
  col += u_sky * u_horizon * 3.5 * exp(-uv.y * 6.0);

  int count = int(clamp(u_curtains, 1.0, 3.0));
  vec3 glow = vec3(0.0);

  for (int i = 0; i < 3; i++) {
    if (i >= count) break;
    float fi = float(i);
    float seed = fi * 2.399;

    /*
     * Each curtain is further away than the last: lower in the frame, dimmer,
     * and folded on a slightly different scale. Depth is the whole reason to
     * draw more than one, so if they share a scale they read as one curtain
     * drawn three times.
     */
    float depth = 1.0 - fi * 0.26;
    float scale = 1.0 + fi * 0.37;

    /*
     * Where the foot of this curtain sits. Low in the frame but not at the
     * bottom of it: the bright core is the part worth looking at, and a foot on
     * the horizon line puts it half off the canvas.
     */
    float base = 0.3 + fi * 0.12 + u_fold * fold(x * scale, phase, seed) * 0.14;
    float h = uv.y - base;
    float reach = max(u_height * depth, 0.01);

    /*
     * Two falloffs rather than one, because an aurora is not an even glow: it
     * has a bright core just above the floor, where the air is still dense
     * enough to light up properly, and a long faint tail above it. One
     * exponential gives you the tail or the core, never both, and a single
     * middling one is the gradient wash this effect looked like at first.
     *
     * Both are exponentials, so a curtain still has no top edge. It runs out.
     */
    float tail = exp(-max(h, 0.0) / reach) * 0.22;
    float core = exp(-max(h, 0.0) / (reach * 0.34)) * 0.95;
    float floorEdge = smoothstep(-0.01, 0.018, h);
    // And a little spill below the foot, which is scattered light in the air
    // under it rather than emission.
    float spill = exp(-max(-h, 0.0) / (reach * 0.14)) * 0.16;

    /*
     * Where along its length this curtain is lit at all.
     *
     * This is the part that decides whether the thing reads as a sheet or as a
     * band of colour across the frame. A real curtain has ends and gaps: it is
     * bright in sections and absent in between, and without that every curtain
     * spans the whole width evenly and the eye has nothing to hold onto.
     */
    float env = 0.5 + 0.5 * fold(x * scale * 0.42 + 3.1, phase + 1.7, seed * 1.3);
    env = smoothstep(0.3, 0.95, env);

    float rays = 0.5 + 0.5 * striation(x * scale + fi * 7.0, phase, seed) * u_rays;
    float amount = ((tail + core) * floorEdge + spill) * max(rays, 0.0) * env * depth;

    // Green at the foot, red at the top. Altitude is the only thing that sets
    // the colour of an aurora, so it is the only thing that sets it here.
    vec3 tint = mix(u_low, u_high, clamp(h / (reach * 2.6), 0.0, 1.0));
    glow += tint * amount;
  }

  col += glow * u_brightness;

  /*
   * A soft shoulder rather than a clamp. Three curtains crossing can easily sum
   * past 1, and clipping turns the overlap into a flat white patch with a hard
   * edge, which is the one thing that never happens in the sky.
   */
  col = vec3(1.0) - exp(-col);

  // Grain, which on a dark ground reads as the sensor noise of a long exposure.
  // Static rather than per-frame: film grain that crawls is a different effect
  // and a far noisier one.
  float tooth = hash12(floor(gl_FragCoord.xy * 0.5)) - 0.5;
  col += tooth * 0.03 * u_grain;

  fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
