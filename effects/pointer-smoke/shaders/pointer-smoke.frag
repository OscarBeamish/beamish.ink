#version 300 es
precision highp float;

/*
 * PointerSmoke: smoke off the cursor, spreading and thinning as it drifts.
 *
 * Not a comet and not a glow. A puff of smoke does two things while it hangs
 * there: it widens, because nothing is holding it together, and it thins,
 * because the same amount of it is spread over more room. So an older puff is
 * bigger and fainter than a new one, which is the opposite of a particle trail,
 * where older means smaller, and it is the thing that makes this read as smoke
 * rather than as a cursor with a tail.
 *
 * The puffs multiply rather than compositing. Two that overlap are denser than
 * either, which is how smoke in front of smoke behaves and is what stops a
 * doubled-back trail reading as a flat shape.
 *
 * Age is carried per puff rather than derived from its index. The index version
 * worked out to one puff per frame, which made the whole effect frame-rate
 * dependent: the same gesture left a third of a second of smoke on a 60Hz
 * display and a sixth on a 120Hz one, and the long version read as something
 * heavy being dragged along behind the cursor.
 */

#define MARKS 28

uniform vec2  u_resolution;
uniform float u_dpr;
uniform vec2  u_marks[MARKS];
uniform float u_ages[MARKS];
uniform float u_count;
uniform float u_active;

uniform vec3  u_paper;
uniform vec3  u_smoke;
uniform vec3  u_accent;
uniform float u_size;
uniform float u_spread;
uniform float u_fade;
uniform float u_edge;
uniform float u_grain;

out vec4 fragColor;

float hash12(vec2 p) {
  return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453123);
}

void main() {
  vec2 cssRes = u_resolution / max(u_dpr, 0.001);
  float shortSide = min(cssRes.x, cssRes.y);
  vec2 cssPx = gl_FragCoord.xy / max(u_dpr, 0.001);

  int count = int(clamp(u_count, 0.0, float(MARKS)));
  float density = 0.0;
  float freshest = 0.0;

  for (int i = 0; i < MARKS; i++) {
    if (i >= count) break;

    /*
     * Age runs 0 for a puff that has just left to 1 for one that has gone. It
     * is supplied per puff rather than taken from the index, which is what
     * makes a trail the same length in seconds whatever the display is doing.
     */
    float age = u_ages[i];
    if (age >= 1.0) continue;

    vec2 markPx = vec2(u_marks[i].x, 1.0 - u_marks[i].y) * cssRes;
    float d = length(cssPx - markPx) / shortSide;

    // Spreading and thinning. A puff that has been out longer is wider and
    // weaker, which is what smoke does and what a particle does not.
    float radius = u_size * (1.0 + age * u_spread);
    float strength = pow(1.0 - age, max(u_fade, 0.01));

    /*
     * A soft shoulder rather than a disc. Smoke has no edge at all, and `edge`
     * sets how much of a puff is that shoulder: at 0 you get plates of grey.
     */
    float puff = 1.0 - smoothstep(radius * (1.0 - u_edge), radius, d);
    float mark = puff * strength;

    // Multiplied, not added: two puffs crossing are denser than either, which
    // is what stops a doubled-back trail reading as one flat shape.
    density = 1.0 - (1.0 - density) * (1.0 - mark);
    freshest = max(freshest, mark * (1.0 - age));
  }

  density *= u_active;

  // The freshest smoke is the densest and carries what warmth there is. The
  // rest of it settles back to the body colour as it thins.
  vec3 colour = mix(u_smoke, u_accent, smoothstep(0.25, 0.8, freshest));
  vec3 col = mix(u_paper, colour, clamp(density, 0.0, 1.0));

  float tooth = hash12(floor(cssPx * 0.5) + 19.0) - 0.5;
  col += tooth * 0.05 * u_grain;

  fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
