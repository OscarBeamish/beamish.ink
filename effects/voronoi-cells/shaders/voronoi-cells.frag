#version 300 es
precision highp float;

/*
 * VoronoiCells: the plane divided up by which point is nearest.
 *
 * Scatter sites across the plane and give every pixel to whichever site is
 * closest. The boundaries are not drawn and are not decided: they fall exactly
 * halfway between neighbouring sites, because that is where "closest" changes
 * its mind. Move a site and every edge it owns moves with it, which is why
 * this reads as a membrane rather than as a pattern.
 *
 * HOW NINE CELLS IS ENOUGH
 *
 * A site lives at a jittered position inside its own lattice cell, so it can
 * never leave that cell. The nearest site to a pixel is therefore in the
 * pixel's own cell or one of the eight around it, and the search is a fixed
 * three by three. No list, no sorting, no texture: nine hashes and nine
 * distances, which is why this costs about as little as anything here.
 *
 * WHERE THE EDGES COME FROM
 *
 * The distance to the nearest site is no use on its own: it says how far you
 * are from a site, not how far you are from a border. The second nearest is
 * what gives the border away. Halfway between two sites the two distances are
 * equal, so their difference goes to zero, and that difference is a usable
 * distance to the edge for free. It is slightly wrong at the corners where
 * three cells meet, by an amount nobody has ever noticed.
 *
 * WHAT MOVES
 *
 * The sites, each on its own small circle, a whole number of turns over the
 * period so the field returns exactly. The colour is keyed to the site's
 * lattice cell rather than to where it currently is, which matters: key it to
 * position and a cell changes colour as it drifts, which reads as a fault.
 *
 * Pure in `t`. The frame comes from `t` alone and never from the frame before
 * it, so the recorder can seek.
 */

uniform vec2  u_resolution;
uniform float u_dpr;
uniform float u_time;
uniform float u_period;

uniform vec3  u_near;
uniform vec3  u_mid;
uniform vec3  u_far;
uniform vec3  u_edge;

uniform float u_cells;
uniform float u_wobble;
uniform float u_thickness;
uniform float u_softness;
uniform float u_depth;
uniform float u_seed;

out vec4 fragColor;

const float TAU = 6.283185307179586;

vec2 hash22(vec2 p) {
  vec3 q = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
  q += dot(q, q.yzx + 33.33);
  return fract((q.xx + q.yz) * q.zy);
}

float hash12(vec2 p) {
  vec3 q = fract(vec3(p.xyx) * 0.1031);
  q += dot(q, q.yzx + 33.33);
  return fract((q.x + q.y) * q.z);
}

/* Three stops rather than two. Between two colours a ramp gives one hue and a
   tint of it; passing through a third is what makes a field of flat cells read
   as lit from somewhere. */
vec3 ramp(float k) {
  k = clamp(k, 0.0, 1.0);
  return k < 0.5 ? mix(u_near, u_mid, k * 2.0) : mix(u_mid, u_far, (k - 0.5) * 2.0);
}

void main() {
  vec2 cssRes = u_resolution / max(u_dpr, 0.001);
  vec2 cssPx = gl_FragCoord.xy / max(u_dpr, 0.001);
  float shortEdge = max(min(cssRes.x, cssRes.y), 1.0);

  /* Measured against the short edge, so the cells stay the same size and
     square in any aspect. */
  vec2 lattice = (cssPx - cssRes * 0.5) / shortEdge * max(u_cells, 1.0);
  vec2 home = floor(lattice);
  vec2 local = fract(lattice);

  float turn = TAU * u_time / max(u_period, 0.001);

  float first = 8.0;
  float second = 8.0;
  vec2 winner = vec2(0.0);

  for (int j = -1; j <= 1; j++) {
    for (int i = -1; i <= 1; i++) {
      vec2 step = vec2(float(i), float(j));
      vec2 cell = home + step;
      vec2 rnd = hash22(cell + u_seed);

      /*
       * The site, on a circle about the middle of its cell. The radius is
       * capped at just under a half so a site can never cross into its
       * neighbour's cell, which is the assumption the three by three search
       * rests on: break it and the nearest site can be two cells away and the
       * field tears along the lattice.
       */
      float a = turn + rnd.x * TAU;
      vec2 site = step + 0.5 + vec2(cos(a), sin(a)) * min(u_wobble, 0.49) * (0.4 + 0.6 * rnd.y);

      float d = length(site - local);
      if (d < first) {
        second = first;
        first = d;
        winner = cell;
      } else if (d < second) {
        second = d;
      }
    }
  }

  /*
   * The colour belongs to the cell, not to the distance. A cell is flat, which
   * is what makes the edges the subject; shading inside it would be a second
   * pattern competing with the first.
   */
  vec3 body = ramp(hash12(winner + u_seed + 11.0));

  /*
   * A little depth, from how far the pixel is from its own site. Just enough
   * that a large cell does not read as a flat sticker, and far too little to
   * be a gradient.
   */
  body *= 1.0 - u_depth * clamp(first, 0.0, 1.0);

  /*
   * The border, from the gap between the nearest two. One pixel of the lattice
   * measured with fwidth, so the line holds its weight at every cell count.
   */
  float px = fwidth(lattice.x);
  float gap = second - first;
  float halfWidth = max(u_thickness, 0.0);
  float soft = px + u_softness * max(halfWidth, px);
  float ink = 1.0 - smoothstep(max(halfWidth - soft, 0.0), halfWidth + soft, gap);

  fragColor = vec4(mix(body, u_edge, ink), 1.0);
}
