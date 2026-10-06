#version 300 es
precision highp float;

/*
 * ScrollWarpImage: a sheet dragged by the scroll.
 *
 * One arc across the width. The sheet is held at its sides, the span between
 * them trails behind the direction the page is moving, and it settles flat the
 * moment the scroll stops. Scroll down and it is pulled down; scroll back up
 * and it hangs the other way.
 *
 * The shape is the whole effect, and it is the one thing worth getting right.
 * A sheet pinned at its edges and heavy in the middle is what a hanging sheet
 * does and what the eye already knows. Pinning the middle and throwing the
 * sides about is the same arithmetic inverted and reads as the frame wobbling
 * rather than as the picture being pulled, which is what this used to do.
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
uniform float u_inset;

out vec4 fragColor;

const float PI = 3.14159265359;

float hash12(vec2 p) {
  return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453123);
}

/*
 * Frame to sheet: 0 to 1 across a rectangle inset from every edge of the frame,
 * and outside that range where the paper is.
 *
 * The margin is what the bend happens in. Without it the bent edge runs off the
 * canvas and is chopped square, which reads as clipping rather than as paper.
 *
 * It is measured in the frame rather than in the picture, which is the fix for
 * the version before this one. That one widened the sampling window instead, so
 * the margin only appeared on the axis the cover fit was not already cropping:
 * a 3:2 photograph in a 16:9 frame came out with paper down the sides and the
 * sheet running edge to edge top and bottom, which is the one axis this effect
 * needs room on. Now the sheet is the same distance in on all four sides
 * whatever shape the picture is.
 */
vec2 sheet(vec2 uv) {
  return (uv - u_inset) / max(1.0 - 2.0 * u_inset, 0.001);
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
vec2 drag(vec2 uv, float amount) {
  /*
   * One arc across the width: zero at both sides, one in the middle. A whole
   * half period of a sine and no more, so there is a single smooth curve with
   * nothing in it to catch the eye, which is what separates this from a wave.
   *
   * Nothing is done to uv.x. Bending both axes at once was an attempt at a
   * sheet deforming in space and it only muddles the shape: the horizontal
   * bend has no edge to run along, so it reads as the picture breathing.
   */
  float arc = sin(uv.x * PI);

  /*
   * The middle goes the way the page is going and the sides hold back, which
   * is a sheet being drawn through its own frame rather than one sagging in
   * it. Scroll down, the page travels up past you and the middle leads it up;
   * scroll back and the curve turns over. It comes level the moment you stop.
   *
   * The other sign is a sag, and it was what this did first. It is the same
   * arithmetic and it reads as weight rather than as travel: the sheet looks
   * tired instead of pulled.
   *
   * The bend is the arc and the slip is flat across the sheet, which is the
   * difference between paper giving in the middle and the whole sheet being
   * late. Both are wanted, and they are kept apart so either can be turned off.
   */
  uv.y += amount * (u_bend * arc + u_slip);

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

  vec2 r = sheet(drag(uv, u_velocity * (1.0 + spread)));
  vec2 g = sheet(drag(uv, u_velocity));
  vec2 b = sheet(drag(uv, u_velocity * (1.0 - spread)));

  vec3 col = vec3(
    texture(u_image, cover(r, u_resolution, u_imageSize)).r,
    texture(u_image, cover(g, u_resolution, u_imageSize)).g,
    texture(u_image, cover(b, u_resolution, u_imageSize)).b
  );

  /*
   * Anything the drag pushed off the sheet is paper. This is what makes the
   * edges of the sheet bend rather than only its contents: the boundary is
   * carried through the same deformation as the picture inside it.
   */
  vec2 inBounds = step(vec2(0.0), g) * step(g, vec2(1.0));
  float inside = inBounds.x * inBounds.y;

  // A pixel of softness on that boundary, so the bent edge is a cut rather than
  // a staircase.
  float aa = fwidth(g.x) + fwidth(g.y);
  float edge = smoothstep(0.0, aa * 1.5, min(min(g.x, 1.0 - g.x), min(g.y, 1.0 - g.y)));
  col = mix(u_paper, col, inside * edge);

  float tooth = hash12(floor(gl_FragCoord.xy * 0.5)) - 0.5;
  col += tooth * 0.045 * u_grain;

  fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
