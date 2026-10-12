#version 300 es
precision highp float;

/*
 * CrtScreen: a picture shown on a tube rather than on a panel.
 *
 * A flat image with scanlines drawn over it reads as an image with stripes on
 * it. What makes something read as a cathode ray tube is a short list of
 * things that all have to be there together, and most of them are not the
 * scanlines:
 *
 *   THE GLASS IS CURVED. The picture is bent outward, so straight lines near
 *   the edges bow and the corners pull in. Without this nothing else helps: a
 *   rectangle with stripes is a rectangle. The bezel is whatever falls outside
 *   the bent picture, which is why it is drawn here rather than in CSS.
 *
 *   THE PHOSPHORS ARE IN COLUMNS. A tube has an aperture grille: red, green
 *   and blue stripes side by side, which is why a white area on a CRT
 *   photograph is never white up close. The scanlines are the rows and the
 *   grille is the columns, and the second is what stops the first reading as
 *   a venetian blind.
 *
 *   THE BEAM OVERSHOOTS. A bright area bleeds into its neighbours, because
 *   the electron beam does not stop where the signal does. Three taps of the
 *   picture, added, is enough: a proper blur would cost a second pass and look
 *   no better behind a grille this coarse.
 *
 *   THE CHANNELS DO NOT LAND TOGETHER. Convergence is never perfect, so red
 *   and blue sit a fraction apart, and the error grows towards the corners
 *   because that is where the deflection is working hardest.
 *
 *   THE TUBE IS DIM AT THE EDGES, and there is a bar rolling down it, from
 *   the signal and the mains being very slightly out of step.
 *
 * WHAT MOVES
 *
 * The roll, once per period, so the last frame is the first frame. The
 * scanlines and the grille are fixed to the glass and do not move, because
 * they are the screen rather than the picture: animate them and the whole
 * thing reads as a pattern sliding over a photograph.
 *
 * Pure in `t`. Nothing here depends on the frame before it, so the recorder
 * can seek.
 */

uniform vec2      u_resolution;
uniform float     u_dpr;
uniform float     u_time;
uniform float     u_period;
uniform sampler2D u_image;
uniform vec2      u_imageSize;

uniform vec3  u_bezel;
uniform vec3  u_tint;
uniform float u_curve;
uniform float u_grille;
uniform float u_mask;
uniform float u_scanline;
uniform float u_scanCount;
uniform float u_bloom;
uniform float u_converge;
uniform float u_vignette;
uniform float u_roll;
uniform float u_brightness;
uniform float u_contrast;

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

/*
 * The bend. Pushing a point outward from the centre by an amount that grows
 * with the square of its distance is what a sphere of glass does to the
 * picture behind it, near enough, and it is one multiply.
 */
vec2 bend(vec2 uv, float amount) {
  vec2 p = uv * 2.0 - 1.0;
  float r2 = dot(p, p);
  p *= 1.0 + amount * r2;
  return p * 0.5 + 0.5;
}

/*
 * One tap of the picture. The flip is here rather than on the upload: a texture
 * from an <img> arrives with its first row at the top, and everything in this
 * shader is in gl_FragCoord's frame, where y counts up from the bottom.
 */
vec3 pick(vec2 uv) {
  return texture(u_image, clamp(vec2(uv.x, 1.0 - uv.y), 0.0, 1.0)).rgb;
}

void main() {
  vec2 cssRes = u_resolution / max(u_dpr, 0.001);
  vec2 cssPx = gl_FragCoord.xy / max(u_dpr, 0.001);
  vec2 screen = cssPx / cssRes;

  vec2 glass = bend(screen, u_curve);

  /*
   * Outside the bent picture is the bezel. One pixel of softness on the edge,
   * because a hard one aliases along the curve where it is steepest and that
   * reads as a jagged corner rather than as a tube.
   */
  vec2 edge = max(-glass, glass - 1.0);
  float outside = max(edge.x, edge.y);
  float onGlass = 1.0 - smoothstep(0.0, 1.5 / max(cssRes.y, 1.0), outside);

  vec2 uv = cover(glass, cssRes, u_imageSize);

  /*
   * Convergence error, growing towards the corners. The green channel is the
   * reference and red and blue are pulled either side of it along the radius,
   * which is the direction the deflection coils are working in.
   */
  vec2 fromCentre = glass - 0.5;
  float reach = length(fromCentre) * 2.0;
  vec2 drift = fromCentre * u_converge * reach * 0.01;
  vec3 picture = vec3(pick(uv + drift).r, pick(uv).g, pick(uv - drift).b);

  /*
   * The overshoot. Three taps across the grille rather than a blur: the
   * grille is about to throw away most of the horizontal detail anyway, so a
   * wider and more expensive kernel buys nothing visible.
   */
  if (u_bloom > 0.0) {
    float step = 2.0 / max(cssRes.x, 1.0);
    vec3 spill = pick(uv + vec2(step, 0.0)) + pick(uv - vec2(step, 0.0));
    picture += max(spill * 0.5 - 0.35, vec3(0.0)) * u_bloom;
  }

  picture = (picture - 0.5) * (1.0 + u_contrast) + 0.5;
  picture *= u_brightness;
  picture *= u_tint;

  /*
   * The aperture grille. Three columns of phosphor per cell, so a cell cycles
   * red, green, blue across its width. Measured in device pixels, not CSS
   * ones: a grille is a physical thing on the glass and ought to get finer on
   * a denser display rather than staying the same size in points.
   */
  float column = gl_FragCoord.x / max(u_grille, 1.0);
  vec3 phosphor = vec3(
    0.5 + 0.5 * cos(TAU * column),
    0.5 + 0.5 * cos(TAU * (column - 1.0 / 3.0)),
    0.5 + 0.5 * cos(TAU * (column - 2.0 / 3.0))
  );
  /*
   * Lifted towards white, by a lot. A grille multiplied in at full strength
   * sends two thirds of every cell to black, and at three device pixels a
   * cell is below the size at which a stripe can be drawn cleanly, so what
   * reaches the eye on a page that is scaling the canvas is not a grille but
   * coloured noise. Lifting it keeps the stripes as a tint over the picture,
   * which is what a tube looks like from the sofa rather than from an inch
   * away. `mask` at 1 is the macro view, and it is worth seeing once.
   */
  float strength = u_grille > 0.0 ? clamp(u_mask, 0.0, 1.0) : 0.0;
  picture *= mix(vec3(1.0), phosphor * 1.6, strength);

  /*
   * The rows. A sine down the glass at the line count, which is a count of
   * lines on the screen and not a frequency in the picture: it stays put when
   * the picture changes.
   */
  float rows = 0.5 + 0.5 * cos(TAU * glass.y * max(u_scanCount, 1.0));
  picture *= 1.0 - u_scanline * rows;

  /*
   * The bar. One pass down the glass per period, so the loop closes, with a
   * soft edge and a faint lift behind it: the signal arriving slightly out of
   * step with the mains, which is what the bar on an untuned set is.
   */
  if (u_roll > 0.0) {
    float at = fract(u_time / max(u_period, 0.001));
    /* Counted down the glass, because the bar rolls down. In gl_FragCoord's
       frame y counts up, so taken straight it rises, which no set has ever
       done. */
    float down = 1.0 - glass.y;
    float band = fract(down - at);
    float lift = smoothstep(0.08, 0.0, band) + smoothstep(0.0, 0.3, band) * 0.0;
    picture *= 1.0 + u_roll * (lift - 0.25 * smoothstep(0.0, 0.25, band));
  }

  /* The tube is dim at the edges. */
  float fade = 1.0 - u_vignette * smoothstep(0.35, 1.15, reach);
  picture *= fade;

  fragColor = vec4(mix(u_bezel, max(picture, vec3(0.0)), onGlass), 1.0);
}
