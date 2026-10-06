#version 300 es
precision highp float;

/*
 * GlassPanel: a slab of glass laid on a picture.
 *
 * Not a blur with a white border. Every part of this is something glass
 * actually does, and the reason it has to be WebGL rather than CSS is the first
 * one: backdrop-filter can blur what is behind an element but it cannot bend
 * it, and bending is most of what glass is.
 *
 *   Refraction. The slab is a signed distance field, and the direction light
 *   bends is that field's gradient, which is the surface normal. The amount is
 *   weighted towards the edge, because the middle of a slab is flat and only
 *   the bevel has an angle to refract through.
 *
 *   Dispersion. Glass has a different refractive index per wavelength, so the
 *   three channels are sampled at three slightly different offsets along that
 *   same normal. This is why the edges fringe, and it is the single cheapest
 *   thing that makes a shape read as glass rather than as plastic.
 *
 *   Frost. A twelve-tap ring, which is not a Gaussian and does not need to be.
 *
 *   Specular and fresnel. The 2D gradient plus a height gives a 3D normal to
 *   light, so the bevel catches a highlight that moves with the light rather
 *   than a painted-on gloss, and the rim brightens where you are looking
 *   through the most glass.
 */

uniform sampler2D u_image;
uniform vec2  u_resolution;
uniform vec2  u_imageSize;
uniform float u_dpr;
uniform float u_scroll;

uniform vec4  u_panel;
uniform float u_radius;
uniform float u_bevel;
uniform float u_refraction;
uniform float u_dispersion;
uniform float u_frost;
uniform float u_specular;
uniform float u_shine;
uniform float u_fresnel;
uniform float u_edge;
uniform float u_tint;
uniform float u_luminosity;
uniform float u_level;
uniform vec3  u_glass;
uniform vec2  u_light;
uniform float u_shadow;
uniform float u_travel;

out vec4 fragColor;

const float TAU = 6.28318530718;

/* Cover fit, the CSS object-fit rule, with the picture pushed by the scroll. */
vec2 cover(vec2 uv, vec2 frame, vec2 image, float shift) {
  float frameAspect = frame.x / max(frame.y, 1.0);
  float imageAspect = image.x / max(image.y, 1.0);
  vec2 scale = imageAspect > frameAspect
    ? vec2(frameAspect / imageAspect, 1.0)
    : vec2(1.0, imageAspect / frameAspect);
  /*
   * The picture has to be larger than the frame before it can travel through
   * it. A cover fit leaves almost no slack when the picture and the frame are
   * close in shape, so the sampled window is shrunk by the travel first, which
   * is the same thing as zooming the picture in, and the slack that makes is
   * what the scroll moves through.
   */
  vec2 scaled = scale / (1.0 + shift * 0.0 + u_travel * 0.3);
  vec2 fitted = (uv - 0.5) * scaled + 0.5;

  /*
   * And only as far as that slack. Pushing a picture further than its fit
   * allows walks off the end of the texture, and the clamp smears the last row
   * of pixels up the frame, which is a stripe nobody will mistake for a
   * photograph.
   */
  float spare = max(0.5 - scaled.y * 0.5, 0.0);
  float offset = clamp(shift * 2.0 - 1.0, -1.0, 1.0) * spare;
  return vec2(fitted.x, fitted.y + offset);
}

vec3 pick(vec2 px, vec2 res, float shift) {
  vec2 uv = px / res;
  return texture(u_image, cover(vec2(uv.x, 1.0 - uv.y), u_resolution, u_imageSize, shift)).rgb;
}

/*
 * Signed distance to a rounded rectangle, negative inside. Exact rather than
 * sampled: the gradient of this is the surface normal and an approximate
 * normal shows up immediately as a wobble along the straight runs.
 */
float sdRoundRect(vec2 p, vec2 halfSize, float r) {
  vec2 q = abs(p) - halfSize + r;
  return min(max(q.x, q.y), 0.0) + length(max(q, 0.0)) - r;
}

/* The analytic gradient of the same field. */
vec2 sdGradient(vec2 p, vec2 halfSize, float r) {
  vec2 q = abs(p) - halfSize + r;
  vec2 s = sign(p);
  if (q.x > 0.0 || q.y > 0.0) {
    // Round corner, or the outside of a straight run.
    vec2 m = max(q, 0.0);
    return s * normalize(m + 1e-6);
  }
  // Inside the straight runs: the nearest edge is whichever is closer.
  return q.x > q.y ? vec2(s.x, 0.0) : vec2(0.0, s.y);
}

void main() {
  vec2 cssRes = u_resolution / max(u_dpr, 0.001);
  float shortSide = min(cssRes.x, cssRes.y);
  vec2 cssPx = gl_FragCoord.xy / max(u_dpr, 0.001);

  float shift = u_scroll;
  vec3 col = pick(cssPx, cssRes, shift);

  // The slab, in CSS pixels, measured from its own centre.
  vec2 centre = vec2(u_panel.x, 1.0 - u_panel.y) * cssRes;
  vec2 halfSize = vec2(u_panel.z, u_panel.w) * cssRes * 0.5;
  float radius = min(u_radius, min(halfSize.x, halfSize.y));
  vec2 p = cssPx - centre;

  float d = sdRoundRect(p, halfSize, radius);
  float pixel = 1.0;

  /*
   * The shadow first, because it lies outside the slab and under it. Glass
   * sitting on a picture casts one, and without it the panel is a window cut
   * in the image rather than an object resting on it.
   */
  float dropped = smoothstep(u_shadow, 0.0, d) * (1.0 - smoothstep(-pixel, pixel, -d));
  col *= 1.0 - dropped * 0.22;

  if (d < pixel) {
    vec2 grad = sdGradient(p, halfSize, radius);

    /*
     * The bevel. 0 across the flat middle and 1 at the rim, which is where the
     * slab has an angle for light to refract through. Everything below is
     * weighted by it, so the centre of the panel is honest glass: blurred and
     * tinted, but not bent.
     */
    float bevel = clamp(1.0 + d / max(u_bevel, 0.5), 0.0, 1.0);
    float curve = bevel * bevel;

    // Where the light enters, in pixels.
    vec2 bend = grad * curve * u_refraction;
    vec2 split = grad * curve * u_dispersion;

    /*
     * Frost, as a twelve-tap ring. Not a Gaussian and it does not need to be:
     * what is behind a panel of frosted glass is a smear, and the eye has no
     * way to tell a correct smear from a cheap one.
     */
    float frost = u_frost * (0.35 + 0.65 * curve);
    vec3 glass = vec3(0.0);
    float taps = 0.0;
    for (int i = 0; i < 12; i++) {
      float a = TAU * float(i) / 12.0;
      vec2 ring = vec2(cos(a), sin(a)) * frost;
      // One sample per channel per tap, offset by the dispersion, so the
      // fringe survives the blur instead of being averaged away.
      glass.r += pick(cssPx + bend + split + ring, cssRes, shift).r;
      glass.g += pick(cssPx + bend + ring, cssRes, shift).g;
      glass.b += pick(cssPx + bend - split + ring, cssRes, shift).b;
      taps += 1.0;
    }
    glass /= taps;

    /*
     * A surface to light. The 2D gradient is the slope of the bevel and the
     * height completes it, so what comes out is a real normal for a rounded
     * edge rather than a painted highlight.
     */
    vec3 normal = normalize(vec3(grad * curve * 1.4, 1.0 - curve * 0.55));
    vec3 lightDir = normalize(vec3(u_light, 0.85));
    vec3 view = vec3(0.0, 0.0, 1.0);
    vec3 halfway = normalize(lightDir + view);

    float spec = pow(max(dot(normal, halfway), 0.0), max(u_shine, 1.0)) * u_specular;
    // A second, broader catch from the opposite side, which is what a room
    // does and what one light never looks like.
    float back = pow(max(dot(normal, normalize(vec3(-u_light, 0.7))), 0.0), 6.0) * u_specular * 0.25;

    // Fresnel: more reflection where you are looking through the most glass.
    float rim = pow(1.0 - max(normal.z, 0.0), 2.2) * u_fresnel;

    /*
     * The inner stroke, on the side facing the light only.
     *
     * Running it the whole way round is the single thing that makes a glass
     * panel look like a lit tube, and it is what almost every version of this
     * effect does. A real slab catches a hairline where the bevel turns towards
     * the light and shows nothing on the side turned away, so the stroke is
     * weighted by how much the edge faces the light, with a floor low enough to
     * keep the shape legible against a pale picture.
     */
    float facing = max(dot(grad, normalize(u_light + 1e-6)), 0.0);
    float band = smoothstep(0.55, 0.98, bevel) * smoothstep(1.0, 0.93, bevel);
    float stroke = band * (0.18 + 0.82 * facing) * u_edge;

    /*
     * Legibility, the way the two systems that have solved this do it.
     *
     * The first attempt here was a milky core: a flat white wash through the
     * middle of the slab. It measured well and looked dead, because washing
     * toward white desaturates the picture and flattens its detail, and what is
     * left is a panel with a smear on it rather than glass.
     *
     * Windows Acrylic does it with a luminosity layer: the backdrop's
     * brightness is pulled toward a level, which compresses how dark or bright
     * it is allowed to get, while the colour and the detail survive. Apple's
     * material does the same thing adaptively, shifting only as far as
     * legibility needs and letting as much content through as possible.
     *
     * So this scales the backdrop's luminance toward `level` rather than
     * mixing it toward a colour. A dark passage comes up, a bright one comes
     * down, the hue is untouched and every edge is still there to be bent. It
     * is compression, not paint.
     */
    float behind = dot(glass, vec3(0.299, 0.587, 0.114));
    float wanted = mix(behind, u_level, u_luminosity);

    /*
     * Replace the luminance, keep the colour difference. This is what a
     * luminosity blend means and the arithmetic matters.
     *
     * Scaling the channels by the ratio of wanted to behind looks like the
     * obvious way to do it and is wrong: it preserves the ratios between the
     * channels, so a dark pixel with a slight cast gets that cast multiplied
     * along with everything else. Lifting a dark green by six turns it into a
     * neon one, and the panel comes out looking like an oil slick.
     *
     * Adding the chroma back at its original size instead moves the brightness
     * without touching how colourful the pixel was. A dark green lifts to a
     * pale green, which is what putting a light behind a piece of coloured
     * glass actually does.
     */
    vec3 chroma = glass - behind;
    vec3 levelled = clamp(vec3(wanted) + chroma * 0.85, 0.0, 1.0);

    vec3 lit = mix(levelled, u_glass, u_tint * 0.6);
    lit += u_glass * (spec + back + rim * 0.35 + stroke);

    float inside = smoothstep(pixel, -pixel, d);
    col = mix(col, lit, inside);
  }

  fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
