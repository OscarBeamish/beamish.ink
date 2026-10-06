#version 300 es
precision highp float;

/*
 * HalftoneReveal: a picture arriving the way a printed one does.
 *
 * Not a fade and not a wipe. The image is screened into halftone cells, and each
 * cell's dot grows from nothing to full. That is how a halftone actually carries
 * tone, so growing the dots is the honest way to bring one in, and it looks like
 * a press coming up to pressure rather than like opacity being turned up.
 *
 * The cells do not all start together. Each one gets an order, and the order is
 * a blend between where the cell sits along the sweep direction and a hash of
 * its coordinates. At `scatter` 0 that is a clean directional sweep; at 1 it is
 * a random dissolve. Everything in between is the useful part.
 */

uniform sampler2D u_image;

uniform vec2  u_resolution;
uniform vec2  u_imageSize;
uniform float u_dpr;
uniform vec3  u_paper;
uniform float u_progress;
uniform float u_screen;
uniform float u_angle;
uniform float u_sweep;
uniform float u_scatter;
uniform float u_order;
uniform float u_shape;
uniform float u_feather;
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

void main() {
  vec2 cssRes = u_resolution / max(u_dpr, 0.001);
  vec2 cssPx = gl_FragCoord.xy / max(u_dpr, 0.001);
  vec2 uv = cssPx / cssRes;

  vec2 sampled = cover(vec2(uv.x, 1.0 - uv.y), u_resolution, u_imageSize);
  vec3 ink = texture(u_image, sampled).rgb;

  /*
   * The screen is laid out in CSS pixels rather than in UV, so the dots stay
   * round and stay the same size when the element changes shape. A screen
   * defined in UV turns into ellipses the moment the box is not square.
   */
  vec2 screen = rot(cssPx, u_angle * DEG) / max(u_screen, 1.0);
  vec2 cell = floor(screen);

  /*
   * One pixel, measured in screen cells, for the edge of every dot. Taken out
   * here rather than inside the loop below: a derivative of a value that varies
   * between iterations is not something to rely on, and the figure is the same
   * for all nine cells anyway.
   */
  float aa = max(fwidth(screen.x), fwidth(screen.y)) * 0.75 + 0.001;

  float feather = max(u_feather, 0.001);
  vec2 dir = rot(vec2(1.0, 0.0), u_sweep * DEG);
  float coverage = 0.0;

  /*
   * Tone, for the two orders that arrive by density rather than by position.
   * Rec. 601 weights: a flat average makes a saturated blue as dark as a
   * saturated yellow and the eye says otherwise by a factor of six.
   *
   * Read at this pixel rather than at each cell's centre, which would be nine
   * more texture samples. The difference is sub-cell on a photograph and the
   * ordering is a soft field, so it costs nothing visible and saves the reads.
   */
  float tone = dot(ink, vec3(0.299, 0.587, 0.114));

  /*
   * The nine cells around this pixel, not just the one it sits in.
   *
   * A dot only stays a dot while it fits inside its own cell. Past a radius of
   * 0.5 a single-cell test clips the circle against the cell edges, so the dots
   * grow into rounded squares and then into plain squares, and the reveal ends
   * up looking like blocks rather than like a screen. Taking the union over the
   * neighbourhood instead lets them spill across the boundaries and merge into
   * each other, which is what ink does.
   */
  for (int oy = -1; oy <= 1; oy++) {
    for (int ox = -1; ox <= 1; ox++) {
      vec2 c = cell + vec2(float(ox), float(oy));
      vec2 centre = c + 0.5;

      // Back out of the rotated screen to find where this cell sits in the
      // frame, which is what the sweep is measured along.
      vec2 cellPx = rot(centre * max(u_screen, 1.0), -u_angle * DEG);
      float along = dot(cellPx / cssRes - 0.5, dir) + 0.5;

      /*
       * Where this cell sits in the queue, 0 first and 1 last.
       *
       * 0 sweep: across the frame along `sweep`.
       * 1 centre: the middle first, working out.
       * 2 edges: the border first, closing in.
       * 3 shadows: the darks first, which is the order a press lays ink down
       *   in: the heavy areas are the ones that take it.
       * 4 highlights: the lights first, which reads as a picture emerging out
       *   of the paper rather than being printed onto it.
       */
      vec2 fromMiddle = cellPx / cssRes - 0.5;
      float radial = clamp(length(fromMiddle * vec2(1.0, cssRes.y / max(cssRes.x, 1.0))) * 2.0, 0.0, 1.0);

      float place = clamp(along, 0.0, 1.0);
      if (u_order > 0.5 && u_order < 1.5) place = radial;
      else if (u_order > 1.5 && u_order < 2.5) place = 1.0 - radial;
      else if (u_order > 2.5 && u_order < 3.5) place = tone;
      else if (u_order > 3.5) place = 1.0 - tone;

      float order = mix(place, hash12(c), u_scatter);

      /*
       * Scaled by 1 + feather so that at progress 1 every cell has finished,
       * however late its order. Without it the last cells are still growing
       * when the reveal is nominally over and the picture never quite arrives.
       */
      float local = clamp((u_progress * (1.0 + feather) - order) / feather, 0.0, 1.0);

      /*
       * The dot's shape, and the radius that fills a cell with it.
       *
       * These are real screens rather than decoration. A round dot is the
       * default everywhere. A square dot holds its shape into the shadows
       * instead of merging, which is why newspapers used it. A diamond is the
       * one that breaks up the jump at fifty percent, where round dots all
       * touch their neighbours at once and the midtone goes abruptly dark.
       *
       * Each needs a different radius to leave no paper behind: a circle has to
       * reach the corner at 0.707, a square fills at 0.5, and a diamond needs
       * 1.0 because its distance is measured along the axes.
       */
      vec2 q = screen - centre;
      float d;
      float fill;
      if (u_shape > 1.5) {
        d = abs(q.x) + abs(q.y);
        fill = 1.02;
      } else if (u_shape > 0.5) {
        d = max(abs(q.x), abs(q.y));
        fill = 0.52;
      } else {
        d = length(q);
        fill = 0.72;
      }

      float radius = local * fill;
      coverage = max(coverage, smoothstep(radius + aa, radius - aa, d));
    }
  }

  vec3 col = mix(u_paper, ink, coverage);

  float tooth = hash12(floor(cssPx * 0.5) + 11.0) - 0.5;
  col += tooth * 0.045 * u_grain;

  fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
