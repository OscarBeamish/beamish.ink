#version 300 es
precision highp float;

/*
 * DustMotes: dust in a room, as a field rather than a particle system.
 *
 * The frame is a lattice. Each cell holds one mote whose position is a function
 * of the cell, a seed and the clock, and a pixel looks only at the nine cells
 * around it. Nothing is stored and nothing is advanced, so the whole thing is
 * pure in t and the count is a division rather than a loop: ten thousand motes
 * cost what a hundred do.
 *
 * The depth of field is the part that matters. A real mote is a few micrometres
 * across, so at any focal distance nearly all of them are blurred smudges and
 * only a handful are sharp. Draw them all sharp and you have snow. Here each
 * mote carries a focus taken from its own hash, which sets both how wide it is
 * drawn and how faint: a blurred mote is spread over more area and so is dimmer,
 * which is what a lens does and what makes the two read as the same object at
 * different distances.
 */

uniform vec2  u_resolution;
uniform float u_dpr;
uniform float u_time;
uniform float u_period;

uniform vec3  u_ground;
uniform vec3  u_mote;
uniform float u_pitch;
uniform float u_size;
uniform float u_haze;
uniform float u_light;
uniform float u_falloff;
uniform float u_drift;
uniform float u_sparkle;
uniform float u_seed;

out vec4 fragColor;

const float TAU = 6.28318530718;

float hash12(vec2 p) {
  return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453123);
}

vec2 hash22(vec2 p) {
  return vec2(hash12(p + u_seed), hash12(p + u_seed + 37.19));
}

void main() {
  vec2 cssRes = u_resolution / max(u_dpr, 0.001);
  vec2 cssPx = gl_FragCoord.xy / max(u_dpr, 0.001);
  float shortSide = max(min(cssRes.x, cssRes.y), 1.0);

  float pitch = max(u_pitch, 4.0);
  vec2 cell = cssPx / pitch;
  vec2 id = floor(cell);

  float phase = TAU * u_time / max(u_period, 0.001);

  /*
   * The light. A mote catches light rather than emitting it, so where it sits
   * in the frame decides how bright it is: the ones on the lit side read, the
   * ones away from it are nearly gone. Without this the field has no direction
   * and reads as static.
   */
  float a = radians(u_light);
  vec2 towards = vec2(cos(a), sin(a));
  vec2 fromCentre = (cssPx - cssRes * 0.5) / shortSide;
  float lit = 1.0 - u_falloff * (0.5 - dot(fromCentre, towards)) ;

  float ink = 0.0;

  for (int oy = -1; oy <= 1; oy++) {
    for (int ox = -1; ox <= 1; ox++) {
      vec2 nid = id + vec2(float(ox), float(oy));
      vec2 rnd = hash22(nid);

      /*
       * Where this cell's mote sits. It drifts on a closed path, so after one
       * period every mote is back where it started and the loop closes, and it
       * rises as often as it falls: dust in a lit room is moved by convection
       * rather than by gravity, and it hangs.
       */
      /*
       * One turn across, two turns up, both whole numbers over the period, so
       * every mote is back where it started when the loop comes round. The
       * first version used 0.7 turns on the vertical, which is a figure that
       * never returns: the seam measured 2.59 against a requirement of zero.
       */
      float wobble = phase + rnd.x * TAU;
      vec2 at = nid + 0.5 + (rnd - 0.5) * 0.8 +
        vec2(cos(wobble), sin(phase * 2.0 + rnd.y * TAU)) * u_drift * 0.5;

      /*
       * How far out of focus this one is. Most are, because at the scale of a
       * mote the depth of field is almost nothing. A blurred mote is spread
       * over more area and is therefore fainter, which is what a lens does: the
       * two together are what make a wide smudge and a tight point read as the
       * same object at different distances.
       */
      float focus = hash12(nid + 11.3);
      float blurred = u_haze * focus;
      float radius = (u_size / pitch) * (1.0 + blurred * 7.0);
      float brightness = 1.0 / (1.0 + blurred * 9.0);

      // A few are bright enough to read as sharp specks. Dust in a sunbeam does
      // this, and it is most of what makes the air look occupied.
      if (hash12(nid + 73.1) < u_sparkle) brightness *= 2.6;

      float d = length(cell - at);
      // A gaussian rather than a disc: a mote has no edge, in or out of focus.
      ink += exp(-(d * d) / max(radius * radius, 1e-6)) * brightness;
    }
  }

  vec3 col = u_ground + u_mote * clamp(ink, 0.0, 4.0) * max(lit, 0.0) * 0.5;

  fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
