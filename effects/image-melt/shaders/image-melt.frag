#version 300 es
precision highp float;

/*
 * ImageMelt: one picture bleeding through another, with a torn edge.
 *
 * The agency version of this is a hover: you point at a card and the first
 * image displaces into the second over about half a second. That cannot be
 * done here, because easing a hover toward a target is a running total and
 * `renderAtTime(t)` has to answer for any moment on its own.
 *
 * So the transition is driven by WHERE the cursor is rather than by how long
 * it has been there. The second picture bleeds out from under it. That is a
 * function of the pointer and the time, both of which the runtime can replay
 * exactly, and it keeps the thing that mattered about the original: a torn,
 * displaced edge between two photographs rather than a crossfade.
 *
 * WHAT MAKES THE EDGE READ AS A TEAR
 *
 *   The boundary is pushed about by noise before it is drawn, not blurred
 *   after. A soft edge is a crossfade with extra steps. An edge that wanders
 *   by a few per cent of the frame is something coming apart.
 *
 *   The two pictures move in opposite directions across it. One is pulled
 *   toward the tear and the other away, so the seam has shear across it and
 *   the eye reads two separate sheets rather than one dissolve.
 *
 *   The channels come apart at the boundary and nowhere else. A fringe over
 *   the whole frame is a broken monitor; a fringe that appears only where the
 *   picture is being torn is the tear doing it.
 */

uniform vec2      u_resolution;
uniform float     u_dpr;
uniform float     u_time;
uniform float     u_period;
uniform sampler2D u_from;
uniform sampler2D u_to;
uniform vec2      u_fromSize;
uniform vec2      u_toSize;
uniform vec2      u_pointer;
uniform float     u_active;

uniform float u_radius;
uniform float u_feather;
uniform float u_displace;
uniform float u_fringe;
uniform float u_grain;
uniform float u_drift;

out vec4 fragColor;

const float TAU = 6.283185307179586;

/* The picture covering the frame rather than stretching to it. */
vec2 cover(vec2 uv, vec2 frame, vec2 image) {
  float frameAspect = frame.x / max(frame.y, 1.0);
  float imageAspect = image.x / max(image.y, 1.0);
  vec2 scale = imageAspect > frameAspect
    ? vec2(frameAspect / imageAspect, 1.0)
    : vec2(1.0, imageAspect / frameAspect);
  return (uv - 0.5) * scale + 0.5;
}

/* A texture from an <img> arrives with its first row at the top; everything
   here is in gl_FragCoord's frame, where y counts up. */
vec3 pick(sampler2D tex, vec2 uv) {
  return texture(tex, clamp(vec2(uv.x, 1.0 - uv.y), 0.0, 1.0)).rgb;
}

vec2 hash22(vec2 p) {
  vec3 q = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
  q += dot(q, q.yzx + 33.33);
  return fract((q.xx + q.yz) * q.zy);
}

/*
 * Smooth noise, from a hashed lattice with a cubic blend between the corners.
 * The blend matters: interpolate linearly and the tear has visible straight
 * creases running through it along the lattice.
 */
float noise(vec2 p) {
  vec2 cell = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash22(cell).x;
  float b = hash22(cell + vec2(1.0, 0.0)).x;
  float c = hash22(cell + vec2(0.0, 1.0)).x;
  float d = hash22(cell + vec2(1.0, 1.0)).x;
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

/* Two octaves. One is too smooth to read as torn; three costs more than the
   difference is worth at this scale. */
float field(vec2 p) {
  return noise(p) * 0.65 + noise(p * 2.17 + 19.3) * 0.35;
}

void main() {
  vec2 cssRes = u_resolution / max(u_dpr, 0.001);
  vec2 cssPx = gl_FragCoord.xy / max(u_dpr, 0.001);
  vec2 screen = cssPx / cssRes;

  float aspect = cssRes.x / max(cssRes.y, 1.0);

  /*
   * The noise drifts a whole number of turns over the period, so the idle
   * state loops and the recorder gets a clean take even with no cursor in it.
   */
  float turn = TAU * u_time / max(u_period, 0.001);
  vec2 wander = vec2(cos(turn), sin(turn)) * u_drift;

  float n = field(screen * u_grain * vec2(aspect, 1.0) + wander);

  /*
   * Distance from the cursor, measured with the aspect put back so the front
   * is a circle on screen rather than an ellipse. Squashed fronts are the
   * commonest giveaway that an effect is working in UV space without thinking
   * about it.
   */
  vec2 fromPointer = (screen - u_pointer) * vec2(aspect, 1.0);
  float dist = length(fromPointer);

  /*
   * The tear. The noise displaces the boundary itself rather than softening
   * it afterwards, which is the difference between something coming apart and
   * a crossfade with a blurry edge.
   */
  float edge = dist - u_radius + (n - 0.5) * u_displace;
  float mixTo = 1.0 - smoothstep(-u_feather, u_feather, edge);

  /* Nothing has been pointed at yet, so show the first picture whole. */
  mixTo *= u_active;

  /*
   * How close this pixel is to the seam, which is what the shear and the
   * colour fringing are scaled by. Both belong only at the boundary.
   *
   * Gated on `active` as well, which the first version forgot. The mix was
   * gated and the seam was not, so before the pointer had ever entered there
   * was no transition but there WAS shear and colour fringing: the untouched
   * frame came out as one picture with a rainbow smear torn across it and
   * nothing to explain it.
   */
  float seam = (1.0 - smoothstep(0.0, u_feather * 2.6, abs(edge))) * u_active;

  vec2 fromUv = cover(screen, cssRes, u_fromSize);
  vec2 toUv = cover(screen, cssRes, u_toSize);

  /*
   * The two pictures pulled in opposite directions across the seam. The shear
   * is what makes it read as two sheets rather than one picture fading.
   */
  vec2 shove = normalize(fromPointer + 1e-6) * seam * u_displace * 0.22;
  fromUv += shove;
  toUv -= shove * 0.6;

  /*
   * The channel split is a small fraction of the shear, not a multiple of it.
   *
   * Scaling it straight off the shove was the first version and it put twenty
   * pixels between the red and blue channels: the seam came out as a rainbow
   * smear across a third of the frame, and both pictures disappeared into it.
   * Chromatic aberration is a thing you notice without being able to point
   * at it. A few pixels is the whole budget.
   */
  vec2 split = shove * u_fringe * 0.1;

  vec3 from = vec3(
    pick(u_from, fromUv + split).r,
    pick(u_from, fromUv).g,
    pick(u_from, fromUv - split).b
  );
  vec3 to = vec3(
    pick(u_to, toUv + split).r,
    pick(u_to, toUv).g,
    pick(u_to, toUv - split).b
  );

  fragColor = vec4(mix(from, to, mixTo), 1.0);
}
