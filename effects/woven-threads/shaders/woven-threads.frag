#version 300 es
precision highp float;

/*
 * WovenThreads: warp one way, weft the other, and one of them on top at every
 * crossing.
 *
 * The interlacing is the item. Two sets of lines crossing is a grid, and a grid
 * has no structure: the threads pass through each other. One comparison per
 * crossing turns it into cloth, and changing that comparison from alternating
 * to shifting is the difference between plain weave and twill, which is why
 * denim has a diagonal in it.
 *
 * The threads wander rather than translate. Each is displaced along its length
 * by a slow wave, so the weave breathes the way fabric does rather than sliding
 * past like a backdrop. Because the displacement moves a thread's centre, the
 * index of the nearest thread is found from the undisplaced grid and then
 * refined with that thread's own offset: exact for any wander under half a
 * pitch, which is far more than cloth does.
 */

uniform vec2  u_resolution;
uniform float u_dpr;
uniform float u_time;
uniform float u_period;

uniform vec3  u_ground;
uniform vec3  u_warp;
uniform vec3  u_weft;
uniform float u_pitch;
uniform float u_width;
uniform float u_float;
uniform float u_relief;
uniform float u_light;
uniform float u_crimp;
uniform float u_wander;

out vec4 fragColor;

const float TAU = 6.28318530718;

/*
 * How far a thread has wandered from its nominal line. A function of which
 * thread it is and how far along it you are, so a single thread snakes rather
 * than the whole cloth sliding. Two turns over the period, so it closes.
 */
float wanderOf(float index, float along, float phase) {
  return (sin(along * 0.021 + phase + index * 1.7) * 0.6 +
          sin(along * 0.047 - phase * 2.0 + index * 0.9) * 0.4) * u_wander * u_pitch;
}

void main() {
  vec2 cssRes = u_resolution / max(u_dpr, 0.001);
  vec2 cssPx = gl_FragCoord.xy / max(u_dpr, 0.001);
  float phase = TAU * u_time / max(u_period, 0.001);

  float pitch = max(u_pitch, 2.0);
  // Not half, which GLSL reserves, and not step, which it defines.
  float reach = pitch * 0.5 * clamp(u_width, 0.05, 1.0);

  /*
   * Which thread, and how far across it. The nominal index comes from the
   * undisplaced grid and is then corrected by that thread's own wander, which
   * is exact while the wander stays under half a pitch.
   */
  float wi = floor(cssPx.x / pitch);
  float wCentre = (wi + 0.5) * pitch + wanderOf(wi, cssPx.y, phase);
  if (abs(cssPx.x - wCentre) > pitch * 0.5) {
    wi += cssPx.x > wCentre ? 1.0 : -1.0;
    wCentre = (wi + 0.5) * pitch + wanderOf(wi, cssPx.y, phase);
  }

  float fj = floor(cssPx.y / pitch);
  float fCentre = (fj + 0.5) * pitch + wanderOf(fj + 37.0, cssPx.x, -phase);
  if (abs(cssPx.y - fCentre) > pitch * 0.5) {
    fj += cssPx.y > fCentre ? 1.0 : -1.0;
    fCentre = (fj + 0.5) * pitch + wanderOf(fj + 37.0, cssPx.x, -phase);
  }

  // Across-thread coordinates, normalised so 1 is the edge of the thread.
  float uWarp = (cssPx.x - wCentre) / max(reach, 0.001);
  float uWeft = (cssPx.y - fCentre) / max(reach, 0.001);

  bool onWarp = abs(uWarp) <= 1.0;
  bool onWeft = abs(uWeft) <= 1.0;

  /*
   * The interlacing. One comparison, and it is the whole difference between
   * cloth and a grid. With float at 1 the pattern alternates every crossing,
   * which is plain weave; higher values let a thread float over several in a
   * row and shift by one each line, which is a twill and brings a diagonal
   * with it.
   */
  float repeat = 2.0 * max(u_float, 1.0);
  float slot = mod(wi + fj * max(u_float, 1.0), repeat);
  bool warpOver = slot < max(u_float, 1.0);

  /*
   * A round thread, shaded by its own profile. The height across a cylinder is
   * the root of one minus the square of the across-coordinate, and the slope of
   * that is the normal. Flat instead, and the cloth is a set of stripes.
   */
  float sun = radians(u_light);
  vec2 sunDir = vec2(cos(sun), sin(sun));

  vec3 col = u_ground;
  float lit = 0.0;
  bool drawWarp = onWarp && (warpOver || !onWeft);
  bool drawWeft = onWeft && (!warpOver || !onWarp);

  if (drawWarp) {
    float u = clamp(uWarp, -1.0, 1.0);
    float h = sqrt(max(1.0 - u * u, 0.0));
    // The slope across the thread, dotted with the light's across-component.
    lit = (-u / max(h, 0.25)) * sunDir.x;
    col = u_warp;
  } else if (drawWeft) {
    float u = clamp(uWeft, -1.0, 1.0);
    float h = sqrt(max(1.0 - u * u, 0.0));
    lit = (-u / max(h, 0.25)) * sunDir.y;
    col = u_weft;
  }

  if (drawWarp || drawWeft) {
    col *= 1.0 + clamp(lit, -1.0, 1.0) * u_relief * 0.5;

    /*
     * Crimp. The thread that goes under is in the shadow of the one above it,
     * and the shadow is deepest where the two cross. Without this the
     * interlacing reads as a hard edge rather than as one thread passing
     * beneath another.
     */
    float under = drawWarp ? (1.0 - clamp(abs(uWeft), 0.0, 1.0)) : (1.0 - clamp(abs(uWarp), 0.0, 1.0));
    bool isUnder = drawWarp ? !warpOver : warpOver;
    if (isUnder) col *= 1.0 - under * u_crimp;
  }

  fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
