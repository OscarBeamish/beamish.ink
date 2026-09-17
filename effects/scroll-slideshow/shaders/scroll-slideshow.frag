#version 300 es
precision highp float;

/*
 * Spool: the paper web running through a press.
 *
 * A web press does not feed sheets, it feeds one continuous ribbon off a reel,
 * and at speed that ribbon bows between the rollers. The faster it runs the more
 * it bows, and when the press stops the paper lies flat again.
 *
 * That is the entire behaviour here. At rest this draws an undistorted image and
 * nothing else, which is the point: the distortion is a function of how fast you
 * are scrolling, so a reader who is not moving never sees an effect at all. Most
 * WebGL sliders warp all the time and read as a filter. This one only shows up
 * while it is being pulled.
 */

uniform sampler2D u_a;
uniform sampler2D u_b;

uniform vec2  u_resolution;
uniform vec2  u_sizeA;
uniform vec2  u_sizeB;
uniform vec3  u_paper;
uniform float u_blend;
uniform float u_velocity;
uniform float u_bend;
uniform float u_slip;
uniform float u_fringe;
uniform float u_grain;
uniform float u_seed;

out vec4 fragColor;

float hash12(vec2 p) {
  return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453123);
}

/*
 * Cover fit, the CSS object-fit rule, done in UV space. Without it every image
 * whose aspect ratio is not the canvas's is stretched, which is the single most
 * common thing wrong with a hand-rolled WebGL slider.
 */
vec2 cover(vec2 uv, vec2 frame, vec2 image) {
  float frameAspect = frame.x / max(frame.y, 1.0);
  float imageAspect = image.x / max(image.y, 1.0);
  vec2 scale = imageAspect > frameAspect
    ? vec2(frameAspect / imageAspect, 1.0)
    : vec2(1.0, imageAspect / frameAspect);
  return (uv - 0.5) * scale + 0.5;
}

void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution;
  // Textures arrive with their origin at the top left and GL samples from the
  // bottom, so this is flipped once here rather than on upload.
  uv.y = 1.0 - uv.y;

  /*
   * How far across the frame this pixel is, 0 in the middle and 1 at the left
   * and right edges. Squared, so the middle of the web stays nearly flat and
   * the bow is concentrated where the paper is unsupported.
   */
  float fromCentre = abs(uv.x * 2.0 - 1.0);
  float edge = fromCentre * fromCentre;

  // The sides lag behind the middle, which is what curves the top and bottom
  // edges. Displacing y by a function of x is the whole trick.
  float bow = u_velocity * u_bend * edge;

  // And the whole web slides a little against the direction of travel, the way
  // anything with mass does when it is pulled.
  float slip = u_velocity * u_slip;

  vec2 warped = vec2(uv.x, uv.y + bow + slip);

  /*
   * A press running colour work has one plate per ink, and if the web is moving
   * when they strike, the inks land a fraction apart. Sampling the channels at
   * slightly different offsets is the same error, and it is what makes fast
   * scrolling read as printing rather than as a blur filter.
   */
  float fringe = u_velocity * u_fringe * edge;

  vec2 aR = cover(warped + vec2(0.0, fringe), u_resolution, u_sizeA);
  vec2 aG = cover(warped, u_resolution, u_sizeA);
  vec2 aB = cover(warped - vec2(0.0, fringe), u_resolution, u_sizeA);

  vec2 bR = cover(warped + vec2(0.0, fringe), u_resolution, u_sizeB);
  vec2 bG = cover(warped, u_resolution, u_sizeB);
  vec2 bB = cover(warped - vec2(0.0, fringe), u_resolution, u_sizeB);

  vec3 a = vec3(texture(u_a, aR).r, texture(u_a, aG).g, texture(u_a, aB).b);
  vec3 b = vec3(texture(u_b, bR).r, texture(u_b, bG).g, texture(u_b, bB).b);

  vec3 col = mix(a, b, u_blend);

  /*
   * Outside the cover rectangle there is no image, only clamped edge pixels
   * smeared into a streak. The bow pushes pixels past the top and bottom of the
   * frame, so this has to be paper rather than whatever the last row happened
   * to be.
   */
  vec2 bounds = step(vec2(0.0), aG) * step(aG, vec2(1.0));
  float inside = bounds.x * bounds.y;
  col = mix(u_paper, col, inside);

  float tooth = hash12(floor(gl_FragCoord.xy * 0.5) + u_seed) - 0.5;
  col += tooth * 0.045 * u_grain;

  fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
