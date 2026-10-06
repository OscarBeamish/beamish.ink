#version 300 es
precision highp float;

/*
 * HalftoneMagnifier: a printer's glass laid on the page.
 *
 * The picture is continuous tone until you look closely, and then it is dots.
 * That is not a stylisation, it is what a printed photograph is, and it is the
 * one thing a screen never shows you. Away from the glass the halftone is finer
 * than the eye resolves and reads as tone, which is exactly why printing works
 * at all. Under the glass it resolves into four screens at four angles, and the
 * rosette they make is the thing worth magnifying.
 *
 * So the dots are not drawn at a size that looks good. They are drawn at
 * `screen` CSS pixels in the print and magnified by `zoom` along with
 * everything else, which is why turning the magnification up makes them bigger
 * rather than finer.
 *
 * Nothing here is antialiased with fwidth. The whole lens sits inside a branch,
 * and derivatives in non-uniform control flow are undefined, so the edge width
 * is worked out from the device pixel ratio instead. It is exact rather than
 * estimated, because a cell is a known size.
 */

uniform sampler2D u_image;
uniform vec2  u_resolution;
uniform vec2  u_imageSize;
uniform float u_dpr;
uniform vec2  u_pointer;
uniform float u_active;

uniform vec3  u_paper;
uniform vec3  u_cyan;
uniform vec3  u_magenta;
uniform vec3  u_yellow;
uniform vec3  u_black;
uniform float u_size;
uniform float u_zoom;
uniform float u_screen;
uniform float u_bulge;
uniform float u_fringe;
uniform float u_rim;
uniform float u_grain;

out vec4 fragColor;

const float DEG = 0.01745329252;

float hash12(vec2 p) {
  return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453123);
}

vec2 rot(vec2 p, float a) {
  float c = cos(a);
  float s = sin(a);
  return mat2(c, -s, s, c) * p;
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

vec3 plate(vec2 uv, vec2 frame, vec2 image) {
  return texture(u_image, cover(vec2(uv.x, 1.0 - uv.y), frame, image)).rgb;
}

/*
 * One screen's worth of dot coverage at a point.
 *
 * `amount` is how much ink that plate wants, 0 to 1, and the dot's *area* is
 * what carries it, so the radius goes as its square root. A halftone that
 * scales the radius instead is a third too dark in the midtones, which is the
 * single most common way to get this wrong.
 *
 * Neighbours as well as the cell the point is in. Past half a cell a dot
 * reaches into the next one, and testing only its own cell clips it square: at
 * seventy percent coverage you get rounded boxes rather than dots touching.
 */
float screenDot(vec2 pagePx, float amount, float angleDeg, float cell, float aa) {
  if (amount <= 0.0001) return 0.0;

  vec2 p = rot(pagePx, angleDeg * DEG) / cell;
  vec2 id = floor(p);
  vec2 f = p - id;

  /*
   * Area, not radius, and with the right constant.
   *
   * A circle of radius r in a unit cell covers pi * r * r, so the radius that
   * lays exactly `amount` of ink is sqrt(amount / pi). Writing it as
   * sqrt(amount) * 0.5 instead, which is the version everybody writes, tops out
   * at pi / 4 of the cell: every tone comes out at 78.5 percent of the ink it
   * asked for and the whole screen sits visibly lighter than the picture it is
   * made from.
   *
   * Past 0.7854 the dots touch and start to overlap, where the closed form
   * stops being closed. The radius runs on to sqrt(2)/2, which is where four
   * neighbours meet at the cell's corner and the last of the paper goes.
   */
  float a = clamp(amount, 0.0, 1.0);
  float radius = a <= 0.7854
    ? sqrt(a / 3.14159265)
    : mix(0.5, 0.70711, (a - 0.7854) / 0.2146);

  float cov = 0.0;
  for (int oy = -1; oy <= 1; oy++) {
    for (int ox = -1; ox <= 1; ox++) {
      vec2 centre = vec2(float(ox), float(oy)) + 0.5;
      cov = max(cov, smoothstep(radius + aa, radius - aa, length(f - centre)));
    }
  }
  return cov;
}

void main() {
  vec2 cssRes = u_resolution / max(u_dpr, 0.001);
  float shortSide = min(cssRes.x, cssRes.y);
  vec2 cssPx = gl_FragCoord.xy / max(u_dpr, 0.001);
  vec2 uv = cssPx / cssRes;

  vec3 col = plate(uv, u_resolution, u_imageSize);

  /*
   * The glass, in short-side units so it stays round and keeps its size when
   * the element changes shape.
   */
  vec2 centre = vec2(u_pointer.x, 1.0 - u_pointer.y) * cssRes;
  vec2 fromCentre = (cssPx - centre) / shortSide;
  float r = length(fromCentre);
  float radius = max(u_size, 0.001);

  // One CSS pixel, in the units the glass is measured in. Every edge below is
  // specified in those, so the barrel is the same weight on any display.
  float pixel = 1.0 / shortSide;

  /*
   * The shadow reaches outside the glass, so the branch has to as well. Still a
   * branch: it is a ring a few pixels wide around a circle, and the rest of the
   * frame pays one texture read.
   */
  float shadow = 7.0 * pixel * u_rim;

  if (u_active > 0.5 && r < radius + shadow) {
    float k = r / radius;

    /*
     * A real halftone-magnifier is a lens, so the magnification is not uniform across it:
     * the middle is strongest and it eases off towards the rim, which is what
     * stops the edge reading as a hole cut in the picture.
     */
    float lens = u_zoom * (1.0 - u_bulge * k * k);
    vec2 lensPx = centre + (cssPx - centre) / max(lens, 1.0);
    vec2 lensUV = lensPx / cssRes;

    /*
     * Lateral colour, which every simple lens has and every one shows most at
     * the rim. Sampling the three channels at three slightly different
     * magnifications is the cheap and correct way round: the error is radial
     * and it grows outward.
     */
    float shift = u_fringe * k * k;
    vec2 red = centre + (cssPx - centre) / max(lens * (1.0 - shift), 1.0);
    vec2 blue = centre + (cssPx - centre) / max(lens * (1.0 + shift), 1.0);

    vec3 ink = vec3(
      plate(red / cssRes, u_resolution, u_imageSize).r,
      plate(lensUV, u_resolution, u_imageSize).g,
      plate(blue / cssRes, u_resolution, u_imageSize).b
    );

    /*
     * Four plates off three channels. Grey component replacement: whatever
     * amount of cyan, magenta and yellow all three have in common is pulled out
     * and printed as black instead, which is what a press does and the reason a
     * shadow in a printed photograph is not a muddy brown.
     */
    vec3 cmy = clamp(1.0 - ink, 0.0, 1.0);
    float black = min(cmy.r, min(cmy.g, cmy.b));
    cmy -= black;

    /*
     * Cell size in page pixels, magnified with everything else. The screen
     * ruling belongs to the print, not to the viewer, so turning the
     * magnification up has to make the dots bigger and not finer.
     */
    float cell = max(u_screen, 0.5) * max(lens, 1.0);
    float aa = 0.8 / cell;
    vec2 pagePx = cssPx - centre;

    /*
     * Fifteen, seventy-five, zero and forty-five degrees. Those four are not
     * decoration: thirty degrees between the strong plates is what keeps their
     * interference down to the fine rosette instead of a coarse plaid, and
     * yellow goes at zero because it is the one you cannot see anyway.
     */
    float dc = screenDot(pagePx, cmy.r, 15.0, cell, aa);
    float dm = screenDot(pagePx, cmy.g, 75.0, cell, aa);
    float dy = screenDot(pagePx, cmy.b, 0.0, cell, aa);
    float dk = screenDot(pagePx, black, 45.0, cell, aa);

    // Multiplied, in plate order. Ink on ink subtracts; two dots crossing are
    // darker than either, which is the whole reason a rosette reads as colour.
    vec3 printed = u_paper;
    printed *= mix(vec3(1.0), u_yellow, dy);
    printed *= mix(vec3(1.0), u_cyan, dc);
    printed *= mix(vec3(1.0), u_magenta, dm);
    printed *= mix(vec3(1.0), u_black, dk);

    // Inside the glass only, and antialiased against the page behind it.
    float inside = smoothstep(radius + pixel, radius - pixel, r);
    col = mix(col, printed, inside);

    /*
     * The barrel, which is three things rather than one.
     *
     * A shadow on the page outside it, because the glass is an object sitting
     * on the paper and an object sitting on paper casts one. A rim, which is
     * the tube itself. And a short fall into shade just inside the rim, because
     * you are looking down a tube. Any one of them alone leaves the magnified
     * patch floating, and a floating patch reads as a filter applied to part of
     * the picture rather than as something resting on it.
     */
    float dropped = smoothstep(radius + shadow, radius, r) * (1.0 - inside);
    col *= 1.0 - dropped * 0.3 * u_rim;

    float ring = smoothstep(radius + pixel * 0.5, radius - pixel * 0.5, r)
      * smoothstep(radius - pixel * 3.0, radius - pixel * 2.0, r);
    float shade = smoothstep(radius * 0.74, radius, r) * inside;
    col *= 1.0 - shade * 0.22 * u_rim;
    col = mix(col, u_black * 0.5, ring * u_rim);
  }

  float tooth = hash12(floor(cssPx * 0.5) + 3.0) - 0.5;
  col += tooth * 0.05 * u_grain;

  fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
