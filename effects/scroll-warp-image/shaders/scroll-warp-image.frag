#version 300 es
precision highp float;

/*
 * ScrollWarpImage: one picture, printed on something that is not flat.
 *
 * The distortion here is driven by scroll position rather than by scroll speed,
 * which is the opposite choice to ScrollSlideshow and gives a completely
 * different feel. Speed-driven means nothing happens until you move. Position
 * driven means the picture is somewhere in a continuous deformation the whole
 * time it is on screen, and scrolling walks it through: pinched as it comes up
 * from the bottom, flat as it passes the middle of the viewport, barrelled as
 * it leaves the top.
 *
 * The edges deform with everything else. The image is not a rectangle with a
 * warped picture inside it; the warp is applied first and whatever falls
 * outside the source is paper, so the boundary itself bends. That is the part
 * that sells it, and it is why there is no geometry here beyond one triangle:
 * the shape of the sheet is a by-product of the sampling, not a mesh.
 */

uniform sampler2D u_image;

uniform vec2  u_resolution;
uniform vec2  u_imageSize;
uniform vec3  u_paper;
uniform float u_travel;
uniform float u_velocity;
uniform float u_bulge;
uniform float u_twist;
uniform float u_squeeze;
uniform float u_fringe;
uniform float u_grain;
uniform float u_vignette;

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

/*
 * The deformation, as a single function of a point and how far through its
 * travel the sheet is. Kept in one place because the colour fringe below has to
 * evaluate it three times at slightly different strengths, and two copies of
 * this that drifted apart would be a very annoying bug to find.
 */
vec2 deform(vec2 p, float amount) {
  float r2 = dot(p, p);

  /*
   * abs(), so the sheet barrels at both ends of its travel and is flat only as
   * it passes the middle. Signing this instead was the obvious reading of
   * "one way, then the other", and it wastes half the effect: a pinch samples
   * inside the picture, so it reads as a plain zoom and the edges stay a
   * rectangle. Expanding at both ends means the boundary bends coming and
   * going, and the direction of travel is carried by the twist below instead.
   */
  p *= 1.0 + abs(amount) * u_bulge * r2;

  /*
   * A twist that grows with radius, so the middle of the picture stays put and
   * the corners lead. Without it the barrel reads as a zoom, because a purely
   * radial scale is what a zoom is.
   */
  float angle = amount * u_twist * r2;
  float s = sin(angle);
  float c = cos(angle);
  p = mat2(c, -s, s, c) * p;

  // Paper pulled between two rollers narrows across its width.
  p.x *= 1.0 + amount * u_squeeze;

  return p;
}

void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution;
  // Textures arrive with their origin at the top left and GL samples from the
  // bottom, so this is flipped once here rather than on upload.
  uv.y = 1.0 - uv.y;

  /*
   * -1 as the sheet comes up from the bottom of the viewport, 0 as it passes
   * the middle, +1 as it leaves the top. Everything below is signed by this, so
   * the deformation runs through flat rather than easing back out the way it
   * came.
   */
  float travel = u_travel * 2.0 - 1.0;

  // Speed adds a little on top of position, so a flick has some weight to it
  // without being the thing that drives the effect.
  float amount = travel + u_velocity * 0.35;

  vec2 p = uv - 0.5;

  /*
   * One plate per ink, and a sheet that is moving when they strike lands them a
   * fraction apart. Here the offset is in the deformation itself rather than in
   * the sampling position, so the channels separate most where the warp is
   * strongest, which is at the corners.
   */
  float spread = u_fringe * abs(amount);

  vec2 rp = deform(p, amount * (1.0 + spread)) + 0.5;
  vec2 gp = deform(p, amount) + 0.5;
  vec2 bp = deform(p, amount * (1.0 - spread)) + 0.5;

  vec2 rUv = cover(rp, u_resolution, u_imageSize);
  vec2 gUv = cover(gp, u_resolution, u_imageSize);
  vec2 bUv = cover(bp, u_resolution, u_imageSize);

  vec3 col = vec3(
    texture(u_image, rUv).r,
    texture(u_image, gUv).g,
    texture(u_image, bUv).b
  );

  /*
   * Anything the deformation pushed outside the source is paper. This is what
   * makes the edges of the sheet bend rather than just its contents: the
   * boundary is wherever the sampling ran out of picture.
   */
  vec2 inBounds = step(vec2(0.0), gUv) * step(gUv, vec2(1.0));
  float inside = inBounds.x * inBounds.y;

  // One pixel of softness on that boundary, so the bent edge is a cut rather
  // than a staircase.
  float aa = fwidth(gUv.x) + fwidth(gUv.y);
  float edge = smoothstep(0.0, aa * 1.5, min(min(gUv.x, 1.0 - gUv.x), min(gUv.y, 1.0 - gUv.y)));
  col = mix(u_paper, col, inside * edge);

  // Ink lies heavier where the sheet curves away. Radial, and signed with the
  // warp, so it arrives and leaves with it.
  float r = length(p) * 1.4;
  col *= 1.0 - u_vignette * r * r * abs(amount);

  float tooth = hash12(floor(gl_FragCoord.xy * 0.5)) - 0.5;
  col += tooth * 0.045 * u_grain;

  fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
