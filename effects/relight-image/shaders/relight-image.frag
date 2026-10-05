#version 300 es
precision highp float;

/*
 * RelightImage: a lamp moved across a printed photograph.
 *
 * This does not relight the scene. There is no depth here and there is no
 * honest way to get one out of a single photograph, so anything claiming to
 * move the sun around inside a picture is guessing. What it lights is the
 * print: the sheet the picture is on, which has relief wherever the impression
 * is heavy, and a raking light finds that relief exactly the way a raking light
 * finds any other surface.
 *
 * Height is the picture's own luminance, so a shadow in the photograph is a
 * hollow in the sheet and a highlight stands proud. The normal comes from the
 * gradient of that height, taken across `smooth` pixels rather than across one,
 * because a one-pixel difference is mostly sensor noise and JPEG blocks and
 * what you want is the shape of the impression rather than the texture of the
 * file.
 *
 * The known failure of deriving relief from luminance is that lighting already
 * in the photograph becomes relief: a cast shadow across a wall turns into a
 * step in the paper. That is a limit worth knowing rather than a bug worth
 * fixing, and it is the reason the modelling is applied *around* the picture
 * rather than replacing it. The photograph stays the photograph. It catches the
 * light.
 */

uniform sampler2D u_image;
uniform vec2  u_resolution;
uniform vec2  u_imageSize;
uniform float u_dpr;
uniform vec2  u_pointer;
uniform float u_active;

uniform vec3  u_light;
uniform float u_height;
uniform float u_relief;
uniform float u_smooth;
uniform float u_strength;
uniform float u_gloss;
uniform float u_shine;
uniform float u_reach;
uniform float u_grain;

out vec4 fragColor;

float hash12(vec2 p) {
  return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453123);
}

/* Cover fit, the CSS object-fit rule, in UV space. */
vec2 cover(vec2 uv, vec2 frame, vec2 image) {
  float frameAspect = frame.x / max(frame.y, 1.0);
  float imageAspect = image.x / max(image.y, 1.0);
  vec2 scale = imageAspect > frameAspect
    ? vec2(frameAspect / imageAspect, 1.0)
    : vec2(1.0, imageAspect / frameAspect);
  return (uv - 0.5) * scale + 0.5;
}

vec3 pick(vec2 cssPx, vec2 cssRes) {
  vec2 uv = cssPx / cssRes;
  return texture(u_image, cover(vec2(uv.x, 1.0 - uv.y), u_resolution, u_imageSize)).rgb;
}

/*
 * Height, which is the picture's own luminance. Rec. 601 weights rather than a
 * flat average: a flat average makes a saturated blue as tall as a saturated
 * yellow, and the eye says otherwise by a factor of six.
 */
float height(vec2 cssPx, vec2 cssRes) {
  return dot(pick(cssPx, cssRes), vec3(0.299, 0.587, 0.114));
}

void main() {
  vec2 cssRes = u_resolution / max(u_dpr, 0.001);
  vec2 cssPx = gl_FragCoord.xy / max(u_dpr, 0.001);
  vec2 uv = cssPx / cssRes;

  vec3 base = pick(cssPx, cssRes);

  /*
   * The surface normal, from a central difference across `smooth` pixels either
   * side. Taking it across one pixel gives you the noise of the file; taking it
   * across several low-passes the height field on the way, which is the first
   * of the two blurs a normal-map generator would do and the one that matters.
   */
  float e = max(u_smooth, 0.5);
  float dx = height(cssPx + vec2(e, 0.0), cssRes) - height(cssPx - vec2(e, 0.0), cssRes);
  float dy = height(cssPx + vec2(0.0, e), cssRes) - height(cssPx - vec2(0.0, e), cssRes);
  vec3 normal = normalize(vec3(-dx * u_relief, -dy * u_relief, 1.0));

  /*
   * The lamp, in a space where the sheet is flat at z = 0 and x is stretched by
   * the aspect so the falloff stays circular on a frame that is not square.
   * `height` is how far above the paper it is held: low is a raking light that
   * finds every ridge, high is a lamp overhead that finds almost none.
   */
  float aspect = cssRes.x / max(cssRes.y, 1.0);
  vec3 lamp = vec3(u_pointer.x * aspect, 1.0 - u_pointer.y, max(u_height, 0.01));
  vec3 here = vec3(uv.x * aspect, uv.y, 0.0);

  vec3 toLamp = lamp - here;
  float dist = length(toLamp);
  vec3 L = toLamp / max(dist, 0.0001);

  float diffuse = max(dot(normal, L), 0.0);
  // Inverse square, softened by the +1 so the lamp does not blow out where it
  // is nearly touching the paper.
  float fall = 1.0 / (1.0 + pow(dist / max(u_reach, 0.01), 2.0));
  float lit = diffuse * fall;

  /*
   * Specular, with the viewer straight on, which is where a reader is. Ink has
   * a sheen that paper does not, so this is the part that says the dark areas
   * are ink rather than dark paper. Blinn's half vector: cheaper than a
   * reflection and better behaved at grazing angles, which is the whole case
   * being drawn here.
   */
  vec3 halfway = normalize(L + vec3(0.0, 0.0, 1.0));
  float spec = pow(max(dot(normal, halfway), 0.0), max(u_shine, 1.0)) * u_gloss * fall;

  /*
   * Modelling around the picture rather than instead of it. At `lit` of a half
   * the photograph is exactly itself, above that it lifts and below it falls,
   * so what the lamp adds is a gradient across the sheet and never a new
   * exposure. Multiplied, because light on a surface scales what is there.
   */
  float on = clamp(u_active, 0.0, 1.0);
  float model = 1.0 + on * u_strength * (lit - 0.5);
  vec3 col = base * model + u_light * spec * on;

  float tooth = hash12(floor(cssPx * 0.5) + 11.0) - 0.5;
  col += tooth * 0.05 * u_grain;

  fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
