#version 300 es
precision highp float;

/*
 * TruchetMaze: quarter-circle tiles that join into one continuous maze.
 *
 * A Truchet tiling is the oldest trick here by two centuries: fill a square
 * lattice with tiles carrying the same marking in one of a few orientations,
 * pick the orientation at random per tile, and the markings join across the
 * edges into something far less regular than the lattice underneath. This is
 * the quarter-circle variant. Each tile holds two arcs of radius half a cell,
 * centred on opposite corners, so every arc meets the cell edge at its
 * midpoint at a right angle. That is the whole reason it works: whichever way
 * the neighbour is flipped, its arc arrives at the same point on the shared
 * edge travelling the same way, so the curve carries on and the joins cannot
 * be seen.
 *
 * WHY THE LINES ARE NOT A TEXTURE
 *
 * The arcs are distance fields, not drawn strokes. Distance to a circle is one
 * length() and a subtraction, so the whole tile is two of those and a minimum,
 * and the stroke is a band around the zero set. That means the line width is a
 * number rather than a resolution, the edges are antialiased by measuring the
 * lattice against the pixel grid with fwidth, and nothing aliases when the
 * cells get small. Drawing this into a texture and scaling it would cost more
 * and look worse.
 *
 * WHAT MOVES
 *
 * Nothing about the maze. The tiles never re-roll, because a tile that flips
 * is a cut: the curve it was part of breaks in two and the eye goes straight
 * to it. What travels is the line weight, as a wave running diagonally across
 * the lattice, so the maze stays put and breathes. One whole cycle per period
 * and the phase advances with the cell index, which makes the last frame the
 * first frame and the loop joins with nothing to hide.
 *
 * Pure in `t`, like every other effect here: the frame is computed from `t`
 * alone, never from the frame before it, so the recorder can seek.
 */

uniform vec2  u_resolution;
uniform float u_dpr;
uniform float u_time;
uniform float u_period;

uniform vec3  u_ground;
uniform vec3  u_near;
uniform vec3  u_mid;
uniform vec3  u_far;

uniform float u_cells;
uniform float u_thickness;
uniform float u_rotation;
uniform float u_softness;
uniform float u_seed;
uniform float u_breathe;
uniform float u_wave;
uniform float u_tilt;

out vec4 fragColor;

const float TAU = 6.283185307179586;

/*
 * Tile coordinate to a number in [0, 1). The multiply-and-stir kind rather
 * than fract(sin(x) * 43758.0): the argument here is a cell index that grows
 * without bound as the lattice is rotated or the cell count raised, and a sine
 * of a large number is a different value on a different driver.
 */
float hash21(vec2 p) {
  vec3 q = fract(vec3(p.xyx) * 0.1031);
  q += dot(q, q.yzx + 33.33);
  return fract((q.x + q.y) * q.z);
}

/* Three stops rather than two. A line between one colour and another gives you
   one hue and a tint of it; travelling through a third is what makes a ramp
   read as light rather than as a fade. */
vec3 ramp(float t) {
  t = clamp(t, 0.0, 1.0);
  return t < 0.5
    ? mix(u_near, u_mid, t * 2.0)
    : mix(u_mid, u_far, (t - 0.5) * 2.0);
}

void main() {
  vec2 cssRes = u_resolution / max(u_dpr, 0.001);
  vec2 cssPx = gl_FragCoord.xy / max(u_dpr, 0.001);
  float shortEdge = max(min(cssRes.x, cssRes.y), 1.0);

  /*
   * Lattice space. Measured against the short edge rather than the height, so
   * the cells stay square and the same size in a 16:9 take and a 9:16 one, and
   * rotated about the centre of the frame so turning the lattice does not also
   * slide it.
   */
  vec2 centred = (cssPx - cssRes * 0.5) / shortEdge;
  float a = radians(u_rotation);
  float cs = cos(a);
  float sn = sin(a);
  vec2 turned = vec2(centred.x * cs - centred.y * sn, centred.x * sn + centred.y * cs);
  vec2 lattice = turned * max(u_cells, 1.0);

  vec2 cell = floor(lattice);
  vec2 local = fract(lattice);

  /*
   * Which diagonal this tile's pair of arcs runs along. One bit per tile is
   * the entire random content of a Truchet tiling, and it is enough.
   */
  float flip = step(0.5, hash21(cell + u_seed));
  float firstX = flip;
  float secondX = 1.0 - flip;

  /* Two quarter circles of radius half a cell, centred on opposite corners. */
  float d1 = abs(length(local - vec2(firstX, 0.0)) - 0.5);
  float d2 = abs(length(local - vec2(secondX, 1.0)) - 0.5);
  float dist = min(d1, d2);

  /*
   * The breathing wave. Its phase advances with time and retreats with the
   * cell's position along the diagonal, which is what makes it travel rather
   * than pulse in place. A whole number of cycles over the period, so t = 0
   * and t = period are the same frame.
   */
  float phase = TAU * u_time / max(u_period, 0.001)
              - (cell.x + cell.y) * TAU / max(u_wave, 1.0);
  /* halfWidth rather than half: `half` is a reserved word in GLSL ES even
     though nothing implements it, and the error it gives names the line
     after the one it is on. */
  float halfWidth = max(u_thickness, 0.001) * 0.5 * (1.0 + u_breathe * cos(phase));

  /*
   * One pixel, measured in lattice units. fwidth here rather than a constant,
   * because the lattice is scaled and rotated and a fixed number would be a
   * different number of pixels at every cell count.
   */
  float px = fwidth(lattice.x) * 0.5;
  float edge = px + u_softness * halfWidth;
  float ink = 1.0 - smoothstep(max(halfWidth - edge, 0.0), halfWidth + edge, dist);

  /*
   * Colour across the frame rather than per tile. Per tile would put a hard
   * edge at every cell boundary, which fights the one thing the tiling is for:
   * the joins should be invisible. A ramp along a diagonal crosses the maze
   * instead, so a single curve changes colour as it travels.
   */
  float along = clamp(turned.x * u_tilt + turned.y * (1.0 - u_tilt) + 0.5, 0.0, 1.0);
  vec3 line = ramp(along);

  fragColor = vec4(mix(u_ground, line, ink), 1.0);
}
