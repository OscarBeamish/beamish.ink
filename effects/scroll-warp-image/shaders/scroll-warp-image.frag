#version 300 es
precision highp float;

/*
 * ScrollWarpImage: one sheet on the web, bowing as it runs.
 *
 * The same press as ScrollSlideshow, and deliberately the same deformation: the
 * sides lag behind the middle, the whole sheet slips against the direction of
 * travel, and the inks land a fraction apart while it moves. At rest it lies
 * flat and there is no effect at all.
 *
 * What is different is that there is one picture and it never changes, so there
 * is no crossfade drawing the eye away from the edges, and the bow runs on both
 * axes rather than one. The slideshow curves the top and bottom because that is
 * all you can see of a sheet that is being replaced. Here every edge of the
 * sheet bends, because the sheet is the subject.
 */

uniform sampler2D u_image;

uniform vec2  u_resolution;
uniform vec2  u_imageSize;
uniform vec3  u_paper;
uniform float u_velocity;
uniform float u_bend;
uniform float u_slip;
uniform float u_fringe;
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

/*
 * The deformation, in one place, because the colour fringe below evaluates it
 * three times at slightly different strengths and two copies that drifted apart
 * would be a miserable bug to find.
 */
vec2 bow(vec2 uv, float amount) {
  /*
   * How far across and down the frame this pixel is, 0 in the middle and 1 at
   * the edges. Squared, so the centre of the sheet stays nearly flat and the
   * bend is concentrated where the paper is unsupported.
   */
  vec2 fromCentre = abs(uv * 2.0 - 1.0);
  vec2 edge = fromCentre * fromCentre;

  /*
   * Each axis is displaced by how far the *other* axis is from the middle. That
   * cross-coupling is the whole trick: displacing y by a function of x is what
   * curves the top and bottom edges, and doing the same the other way round
   * curves the sides. Displacing each axis by its own distance would only
   * stretch the sheet, which reads as a zoom.
   */
  uv.y += amount * u_bend * edge.x;
  uv.x += amount * u_bend * edge.y * 0.65;

  // And the whole sheet slides a little against the direction of travel, the
  // way anything with mass does when it is pulled.
  uv.y += amount * u_slip;

  return uv;
}

void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution;
  // Textures arrive with their origin at the top left and GL samples from the
  // bottom, so this is flipped once here rather than on upload.
  uv.y = 1.0 - uv.y;

  /*
   * A press running colour work strikes one plate per ink, and a web that is
   * moving when they hit lands them a fraction apart. Three evaluations of the
   * same bow at slightly different strengths is the same error, and it is what
   * makes a fast scroll read as printing rather than as a blur.
   */
  float spread = u_fringe * abs(u_velocity);

  vec2 rUv = cover(bow(uv, u_velocity * (1.0 + spread)), u_resolution, u_imageSize);
  vec2 gUv = cover(bow(uv, u_velocity), u_resolution, u_imageSize);
  vec2 bUv = cover(bow(uv, u_velocity * (1.0 - spread)), u_resolution, u_imageSize);

  vec3 col = vec3(
    texture(u_image, rUv).r,
    texture(u_image, gUv).g,
    texture(u_image, bUv).b
  );

  /*
   * Anything the bow pushed outside the source is paper. This is what makes the
   * edges of the sheet bend rather than only its contents: the boundary is
   * wherever the sampling ran out of picture.
   */
  vec2 inBounds = step(vec2(0.0), gUv) * step(gUv, vec2(1.0));
  float inside = inBounds.x * inBounds.y;

  // A pixel of softness on that boundary, so the bent edge is a cut rather than
  // a staircase.
  float aa = fwidth(gUv.x) + fwidth(gUv.y);
  float edge = smoothstep(0.0, aa * 1.5, min(min(gUv.x, 1.0 - gUv.x), min(gUv.y, 1.0 - gUv.y)));
  col = mix(u_paper, col, inside * edge);

  float tooth = hash12(floor(gl_FragCoord.xy * 0.5)) - 0.5;
  col += tooth * 0.045 * u_grain;

  fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
