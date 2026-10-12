#version 300 es
precision highp float;

/*
 * TumblingBlocks: a rhombille tiling, read as stacked cubes.
 *
 * Three rhombi fill a hexagon exactly, and if each one is shaded as though it
 * were a different face of a cube the hexagon stops being a hexagon and
 * becomes a cube seen corner-on. Tile the plane with those and the eye reads a
 * wall of stacked blocks. It is the oldest optical illusion in quilting, where
 * it is called tumbling blocks, and the reversal, the moment the stack flips
 * and you cannot see it the first way again, is free.
 *
 * WHAT ACTUALLY MAKES THE ILLUSION
 *
 * Not the outline. The three faces have to be shaded as though one light were
 * falling across all of them, and the shading has to be CONSISTENT across the
 * whole field: every top face the same, every left face the same, every right
 * face the same. Vary it per cube and the illusion collapses into a flat
 * pattern of diamonds, because the only thing telling the eye these are solids
 * is that the lighting agrees everywhere.
 *
 * So the per-cube variation here is in hue and never in the shading. A cube
 * can be a different colour from its neighbour; it cannot be lit differently.
 *
 * WHAT MOVES
 *
 * The light goes round. One whole turn over the period, so the last frame is
 * the first frame, and because the three face normals are fixed the faces
 * brighten and darken in sequence rather than together: the stack appears to
 * turn without a single vertex moving. Nothing in the geometry is a function
 * of time at all.
 *
 * Pure in `t`. The frame comes from `t` alone, never from the frame before it,
 * so the recorder can seek.
 */

uniform vec2  u_resolution;
uniform float u_dpr;
uniform float u_time;
uniform float u_period;

uniform vec3  u_near;
uniform vec3  u_far;
uniform vec3  u_line;

uniform float u_cells;
uniform float u_rotation;
uniform float u_thickness;
uniform float u_softness;
uniform float u_variation;
uniform float u_relief;
uniform float u_seed;

out vec4 fragColor;

const float TAU = 6.283185307179586;
const float SQRT3 = 1.7320508075688772;

float hash21(vec2 p) {
  vec3 q = fract(vec3(p.xyx) * 0.1031);
  q += dot(q, q.yzx + 33.33);
  return fract((q.x + q.y) * q.z);
}

/*
 * Which hexagon a point is in, and where inside it.
 *
 * A hexagonal lattice is two rectangular lattices offset by half a cell, so
 * the cheap way to find the nearest centre is to measure against both and keep
 * whichever is closer. Returns the local offset in .xy and the hexagon's own
 * index in .zw, which is what the per-cube hash needs.
 */
vec4 hexCell(vec2 p) {
  vec2 s = vec2(1.0, SQRT3);
  vec4 centres = floor(vec4(p / s, (p - s * 0.5) / s)) + 0.5;
  vec4 offsets = vec4(p - centres.xy * s, p - (centres.zw + 0.5) * s);
  return dot(offsets.xy, offsets.xy) < dot(offsets.zw, offsets.zw)
    ? vec4(offsets.xy, centres.xy)
    : vec4(offsets.zw, centres.zw + 0.5);
}

/*
 * Distance to a ray from the origin, rather than to the line through it.
 *
 * This is the whole difference between three spokes and six. A hexagon's three
 * internal edges run from its centre to every other vertex, and a line through
 * the centre at one of those angles also passes through the opposite vertex,
 * so using lines draws the spokes twice and the rhombi come out as six
 * triangles. Behind the ray the nearest point on it is the origin, so the
 * distance there is just the length.
 */
float rayDistance(vec2 p, vec2 dir) {
  float along = dot(p, dir);
  return along > 0.0 ? abs(dot(p, vec2(-dir.y, dir.x))) : length(p);
}

void main() {
  vec2 cssRes = u_resolution / max(u_dpr, 0.001);
  vec2 cssPx = gl_FragCoord.xy / max(u_dpr, 0.001);
  float shortEdge = max(min(cssRes.x, cssRes.y), 1.0);

  /* Measured against the short edge so the blocks stay the same size and
     shape in any aspect, and rotated about the centre of the frame. */
  vec2 centred = (cssPx - cssRes * 0.5) / shortEdge;
  float a = radians(u_rotation);
  float cs = cos(a);
  float sn = sin(a);
  vec2 turned = vec2(centred.x * cs - centred.y * sn, centred.x * sn + centred.y * cs);
  vec2 lattice = turned * max(u_cells, 1.0);

  vec4 cell = hexCell(lattice);
  vec2 local = cell.xy;
  vec2 id = cell.zw;

  /*
   * Which of the three faces. The hexagon divides into three 120 degree
   * sectors, and the sector a point falls in is the face it belongs to. The
   * quarter turn offset puts the boundaries on the vertices rather than
   * through the middles of the rhombi.
   */
  float angle = atan(local.y, local.x);
  float sector = floor(mod((angle + TAU * 0.25) / TAU * 3.0, 3.0));

  /*
   * One light, falling the same way on every cube in the field. This is the
   * illusion: three faces agreeing about where the light is. The normals are
   * the sector centres, a third of a turn apart, and the light goes round once
   * per period.
   */
  /*
   * The face normal is the sector's OWN centre, which is not where the sector
   * numbering starts. The quarter turn above moves the boundaries onto the
   * vertices, which puts the three rhombi at minus thirty, ninety and two
   * hundred and ten degrees. Reusing the quarter turn here instead gave
   * ninety, two hundred and ten and three hundred and thirty: every face lit
   * as though it were the one next to it. Consistent, and consistently wrong,
   * which is the worst kind because the field still looks deliberate. It just
   * never resolves into cubes.
   */
  float faceAngle = -TAU / 12.0 + sector * TAU / 3.0;
  float lightAngle = TAU * u_time / max(u_period, 0.001);
  float lit = 0.5 + 0.5 * cos(faceAngle - lightAngle);
  /* Pulled towards the middle so no face goes fully black: a cube with an
     unlit face reads as a hole in the wall rather than as a solid. */
  /*
   * 0.8 rather than 0.5. At 0.5 the brightest face is only 1.74 times the
   * darkest at full relief, and a cube whose faces are that close together
   * does not read as a solid: real faces at right angles to each other
   * differ by nearer three to one. This takes the range to 3.1:1 and leaves
   * the darkest face well clear of black, because a face at black reads as a
   * hole in the wall rather than as a side turned away from the light.
   */
  float shade = mix(1.0 - u_relief * 0.8, 1.0, lit);

  /*
   * Hue varies per cube, shading never does. Vary the shading per cube and
   * the solids collapse into flat diamonds, because agreement about the light
   * is the only thing telling the eye they are solids at all.
   */
  float tone = hash21(id + u_seed) * clamp(u_variation, 0.0, 1.0);
  vec3 body = mix(u_near, u_far, tone) * shade;

  /*
   * The edges: the hexagon's own outline, plus the three internal spokes that
   * divide it into rhombi. The outline is shared with the neighbour, so
   * drawing it from both sides is what makes one continuous lattice.
   */
  float spokes = 1e9;
  for (int i = 0; i < 3; i++) {
    float t = TAU * 0.25 + (float(i) + 0.5) * TAU / 3.0;
    spokes = min(spokes, rayDistance(local, vec2(cos(t), sin(t))));
  }
  /* Hexagon edge: the half width is sqrt(3)/4 across the flats. */
  vec2 q = abs(local);
  float outline = abs(SQRT3 * 0.25 - max(q.x * 0.5 + q.y * SQRT3 * 0.25, q.x * 0.5));
  float edge = min(spokes, outline);

  float px = fwidth(lattice.x) * 0.5;
  float halfWidth = max(u_thickness, 0.0) * 0.5;
  float soft = px + u_softness * max(halfWidth, px);
  float ink = 1.0 - smoothstep(max(halfWidth - soft, 0.0), halfWidth + soft, edge);

  fragColor = vec4(mix(body, u_line, ink), 1.0);
}
