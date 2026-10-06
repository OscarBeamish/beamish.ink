#version 300 es
precision highp float;

/*
 * MeshGradient: the soft flowing colour field that sits behind half the
 * software marketing on the web, and behind Stripe's home page in particular.
 *
 * It is worth being precise about what that effect actually is, because the
 * name people give it is wrong in a way that matters. It is not a CSS gradient
 * with more stops and it is not a blurred photograph of some blobs. The
 * original is a plane cut into a grid of a few hundred vertices, each one
 * pushed around by layered noise, with three or four colour layers blended over
 * each other by more noise. The faint sense of a surface being folded rather
 * than a picture being blurred comes from the geometry: the shading follows the
 * displacement.
 *
 * This reproduces that in a fragment shader, with the three ingredients the
 * original has and nothing else:
 *
 *   Layered waves. Several octaves, each finer and weaker than the last. That
 *   is what gives the field its scale: broad shapes with detail inside them,
 *   rather than one smooth blob or one busy texture.
 *
 *   A domain warp. The field is read at a position pushed sideways by another
 *   field, which is what bends the bands around each other instead of leaving
 *   them as parallel stripes.
 *
 *   Shading from the slope. The same derivative that would have moved a vertex
 *   is used to light the result, so the colour has a direction to it. Take this
 *   out and the whole thing flattens into wallpaper, which is the difference
 *   between this and most of the copies of it.
 *
 * The diagonal edge people associate with the effect is not in here and should
 * not be: on the original it is the container, skewed with CSS and clipped. The
 * recipe says how, because it is two lines and it is not the shader's business.
 */

uniform vec2  u_resolution;
uniform float u_dpr;
uniform float u_time;
uniform float u_period;

uniform vec3  u_base;
uniform vec3  u_one;
uniform vec3  u_two;
uniform vec3  u_three;

uniform float u_scale;
uniform float u_warp;
uniform float u_softness;
uniform float u_relief;
uniform float u_grain;

out vec4 fragColor;

const float TAU = 6.28318530718;

float hash12(vec2 p) {
  return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453123);
}

/*
 * A field of travelling waves, returned as value and slope together.
 *
 * The frequencies are in cycles across the unit square rather than radians,
 * because a frequency only means anything against the width it has to cross.
 * The time coefficients are whole numbers of turns over the period, so the loop
 * closes exactly: the alternative is noise advanced by time, which never
 * returns to its first frame and which the recorder cannot use.
 *
 * The slope comes from the same expression as the value. It is not an
 * optimisation, it is the shading: on the original effect the light follows the
 * displacement of the mesh, and this is the same derivative that displacement
 * would have used.
 */
vec3 field(vec2 p, float phase, float seed) {
  vec2 dirs[4] = vec2[4](
    vec2(0.93, 0.37),
    vec2(-0.48, 0.88),
    vec2(0.31, -0.95),
    vec2(-0.89, -0.46)
  );
  float freq[4] = float[4](0.38, 0.71, 1.29, 2.23);
  float amp[4] = float[4](1.0, 0.54, 0.28, 0.14);
  float harm[4] = float[4](1.0, 1.0, 2.0, 2.0);

  float v = 0.0;
  vec2 slope = vec2(0.0);
  for (int i = 0; i < 4; i++) {
    float k = freq[i] * TAU;
    float arg = dot(p, dirs[i]) * k + phase * harm[i] + seed * (float(i) + 1.7);
    v += amp[i] * sin(arg);
    slope += amp[i] * cos(arg) * k * dirs[i];
  }
  return vec3(v / 1.96, slope / 1.96);
}

void main() {
  vec2 cssRes = u_resolution / max(u_dpr, 0.001);
  vec2 cssPx = gl_FragCoord.xy / max(u_dpr, 0.001);
  float shortSide = min(cssRes.x, cssRes.y);
  vec2 p = (cssPx - cssRes * 0.5) / max(shortSide, 1.0) * max(u_scale, 0.05);

  float phase = TAU * u_time / max(u_period, 0.001);

  /*
   * The warp. Two more fields push the plane sideways before it is read, which
   * is what bends the bands around each other. Without it they are stripes, and
   * stripes are what gives away most attempts at this.
   *
   * It is frozen rather than moving: the layers drifting through a fixed warp
   * is a field flowing through a shape, and warping the warp as well doubles
   * the measured change per frame for something that reads as the whole image
   * sliding.
   */
  vec3 wx = field(p + vec2(4.1, 0.7), 0.0, 1.0);
  vec3 wy = field(p + vec2(-1.9, 3.3), 0.0, 2.0);
  vec2 q = p + u_warp * vec2(wx.x, wy.x);

  vec2 jx = vec2(1.0 + u_warp * wx.y, u_warp * wx.z);
  vec2 jy = vec2(u_warp * wy.y, 1.0 + u_warp * wy.z);

  vec3 col = u_base;
  vec2 shade = vec2(0.0);

  /*
   * Three colour layers, each its own field, each blended over what is already
   * there. Soft edges rather than hard ones: `softness` is the width of the
   * transition, and it is the single control that decides whether this reads as
   * a gradient or as a map of three countries.
   */
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    vec3 f = field(q * (1.0 + fi * 0.31), phase, 3.0 + fi * 2.3);
    float a = smoothstep(-u_softness, u_softness, f.x - 0.12 + fi * 0.06);

    vec3 tint = i == 0 ? u_one : (i == 1 ? u_two : u_three);
    col = mix(col, tint, a);

    // The slope of this layer, carried through the warp by the chain rule, and
    // weighted by how much of this layer is actually showing here.
    vec2 g = vec2(dot(f.yz, jx), dot(f.yz, jy));
    shade += g * a;
  }

  /*
   * Lit by its own slope. One light, from the upper left, which is where light
   * is in every photograph anybody has ever liked.
   */
  float lift = dot(normalize(shade + vec2(1e-4)), normalize(vec2(-0.6, 0.8)));
  col *= 1.0 + lift * u_relief * min(length(shade), 1.5);

  float tooth = hash12(floor(gl_FragCoord.xy * 0.5)) - 0.5;
  col += tooth * 0.035 * u_grain;

  fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
