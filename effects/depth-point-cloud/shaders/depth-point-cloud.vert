
/*
 * The wander lives here rather than in JavaScript.
 *
 * Twenty thousand points moved on the CPU means twenty thousand vectors
 * uploaded every frame; moved here it is one uniform and the positions never
 * change. Each point carries its own phase so the cloud does not travel as a
 * sheet, and the displacement is a sine of whole turns per period, so every
 * point is exactly where it started when the loop comes round.
 */

attribute float aPhase;

uniform float u_time;
uniform float u_period;
uniform float u_drift;
uniform float u_size;
uniform float u_scale;

varying vec3 vColor;

const float TAU2 = 6.28318530718;

void main() {
  vColor = color;

  float turn = TAU2 * u_time / max(u_period, 0.001);

  /*
   * Two turns one way and three the other, which are whole numbers so the
   * loop closes, and coprime so a point does not retrace the same short path
   * several times a cycle.
   */
  vec3 wander = vec3(
    sin(2.0 * turn + aPhase),
    cos(3.0 * turn + aPhase * 1.7),
    sin(3.0 * turn + aPhase * 2.3)
  ) * u_drift;

  vec4 world = modelViewMatrix * vec4(position + wander, 1.0);

  /*
   * Size falls off with distance, which is what makes the cloud read as having
   * depth at all. Without it the far points are as big as the near ones and
   * the whole thing flattens into a texture, which is the most common way this
   * kind of effect goes wrong.
   */
  gl_PointSize = u_size * u_scale / max(-world.z, 0.001);
  gl_Position = projectionMatrix * world;
}
